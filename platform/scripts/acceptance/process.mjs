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
  { timeoutMs = 600_000, env = {}, requireTests = false } = {},
) {
  const started = Date.now();
  const output = [];
  let bytes = 0;
  const childEnv = { ...process.env, ...env };
  // A test invoking this helper must not make the independently spawned test
  // command inherit Node's private child-runner protocol instead of TAP output.
  delete childEnv.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: root,
      env: childEnv,
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
  const captured = Buffer.concat(output);
  await writeFile(join(evidenceDir, log), captured);
  const summary = {};
  if (requireTests) {
    for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      const values = [...captured.toString('utf8').matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, 'gm'))];
      summary[key] = values.length ? Number(values.at(-1)[1]) : null;
    }
  }
  const evidenceError = bytes === 0 ? 'Required gate produced no evidence output' :
    bytes > 16 * 1024 * 1024 ? 'Required gate output exceeded the evidence capture limit' :
    requireTests && !(summary.tests > 0 && summary.pass === summary.tests &&
      ['fail', 'cancelled', 'skipped', 'todo'].every((key) => summary[key] === 0)) ?
      'Required tests are missing, failed, cancelled, skipped, or TODO' : null;
  const gate = {
    name,
    command,
    status: result.exitCode === 0 && !result.timedOut && !evidenceError ? 'passed' : 'failed',
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    timedOut: result.timedOut,
    error: result.error ?? evidenceError,
    outputBytes: bytes,
    ...(requireTests ? { testSummary: summary } : {}),
    durationMs: Date.now() - started,
    log: relative(root, `${evidenceDir}/${log}`),
  };
  process.stdout.write(`${JSON.stringify(gate)}\n`);
  return gate;
}
