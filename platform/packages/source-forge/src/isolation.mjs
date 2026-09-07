// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { assert, noPrototypeKeys } from '../../conversation/src/common.mjs';

const COMPILE_TIMEOUT_MS = 90_000;

function compilerProcessError(outcome, stderr) {
  const reason = outcome.timedOut
    ? `Compiler exceeded the ${COMPILE_TIMEOUT_MS} ms execution budget`
    : `Compiler exited before producing a result (code ${outcome.code ?? 'none'}, signal ${outcome.signal ?? 'none'})`;
  assert(
    false,
    outcome.timedOut ? 504 : 500,
    outcome.timedOut ? 'COMPILE_TIMEOUT' : 'COMPILE_PROCESS',
    reason,
    { exitCode: outcome.code, signal: outcome.signal, stderr: stderr || null },
  );
}

/** Resource-bounded compiler subprocess. No host API/master secrets are inherited.
 * OS-container isolation remains mandatory for adversarial production tenants. */
export async function compileIsolated(kit, options = {}, signal) {
  noPrototypeKeys(kit);
  const raw = JSON.stringify({ kit, options });
  assert(raw.length <= 500000, 413, 'SOURCE_SIZE', 'Source request exceeds budget');
  const directory = await mkdtemp(join(tmpdir(), 'atelier-compile-')),
    input = join(directory, 'input.json'),
    output = join(directory, 'output.json');
  try {
    await writeFile(input, raw, { mode: 0o600 });
    const outcome = await new Promise((ok, bad) => {
      const child = spawn(
        process.execPath,
        [
          '--max-old-space-size=512',
          fileURLToPath(new URL('./compile-child.mjs', import.meta.url)),
          input,
          output,
        ],
        {
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            HOME: directory,
            TMPDIR: directory,
            NODE_ENV: 'production',
          },
          stdio: ['ignore', 'ignore', 'pipe'],
          detached: true,
        },
      );
      let stderr = '';
      child.stderr.on('data', (d) => {
        if (stderr.length < 16000) stderr += d;
      });
      const kill = () => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      };
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, COMPILE_TIMEOUT_MS);
      signal?.addEventListener('abort', kill, { once: true });
      child.once('error', (e) => {
        clearTimeout(timer);
        bad(e);
      });
      child.once('close', (code, childSignal) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', kill);
        ok({ code, signal: childSignal, timedOut });
      });
    });
    assert(!signal?.aborted, 409, 'JOB_CANCELLED', 'Compile was cancelled');
    const meta = await stat(output).catch((error) => {
      if (error.code === 'ENOENT') compilerProcessError(outcome, stderr);
      throw error;
    });
    assert(meta.size <= 2500000, 413, 'COMPILE_OUTPUT', 'Compile output exceeded limit');
    const response = JSON.parse(await readFile(output, 'utf8'));
    assert(
      response.ok,
      400,
      response.error?.code ?? 'COMPILE_FAILED',
      response.error?.message ?? 'Compile failed',
      response.error?.details,
    );
    const { verifyCompilation } = await import('./compiler.mjs');
    return verifyCompilation(response.result);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
