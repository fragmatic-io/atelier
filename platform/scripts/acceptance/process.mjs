// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function runGate(
  root,
  evidenceDir,
  name,
  command,
  { timeoutMs = 600_000, env = {} } = {},
) {
  const started = Date.now();
  const output = [];
  let bytes = 0;
  const result = await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const capture = (chunk) => {
      bytes += chunk.length;
      if (bytes <= 16 * 1024 * 1024) output.push(chunk);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, error: error.message, timedOut });
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, timedOut });
    });
  });
  const log = `${name}.log`;
  await writeFile(join(evidenceDir, log), Buffer.concat(output));
  const gate = {
    name,
    command,
    status: result.exitCode === 0 && !result.timedOut ? 'passed' : 'failed',
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    timedOut: result.timedOut,
    error: result.error ?? null,
    durationMs: Date.now() - started,
    log: relative(root, `${evidenceDir}/${log}`),
  };
  process.stdout.write(`${JSON.stringify(gate)}\n`);
  return gate;
}
