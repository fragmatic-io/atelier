// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Test runner for `atelier validate`.
 *
 * Runs the consumer's `test` script via the detected package manager.
 * We intentionally invoke the script the consumer actually wrote — that's
 * the contract. Vitest, Jest, Mocha, node:test all work as long as the
 * script is sane.
 *
 * Detection signals (via `DetectedStack.hasTestScript` and `hasVitest`):
 *   - `package.json` declares a `test` script that is non-empty and not
 *     the conventional `echo "Error: no test specified"` placeholder.
 *
 * Failure detail is parser-best-effort. We don't try to teach this runner
 * about every test framework's reporter format — instead we surface the
 * exit code and a tail of stdout/stderr.
 */

import { spawn } from 'node:child_process';

import type { DetectedStack } from '../detect-stack.js';
import type { ValidatorResult } from './index.js';

/**
 * Run the consumer's `test` script through their package manager. Reports
 * pass/fail by exit code; captures the tail of stderr on failure.
 */
export async function runVitest(stack: DetectedStack): Promise<ValidatorResult> {
  const start = Date.now();
  if (!stack.hasTestScript) {
    return {
      id: 'test',
      label: 'Tests',
      status: 'skip',
      scope: './',
      fileCount: null,
      errorCount: null,
      reason: 'no test script',
      issues: [],
      durationMs: Date.now() - start,
    };
  }

  const cmd = stack.packageManager;
  // pnpm/npm/yarn all support `<pm> test` to run the `test` script. Yarn
  // also supports `yarn test`, but `yarn run test` is more deterministic.
  const args = cmd === 'yarn' ? ['run', 'test'] : ['test'];
  const out = await runCapture(cmd, args, stack.root);

  if (out.spawnError) {
    return {
      id: 'test',
      label: 'Tests',
      status: 'skip',
      scope: './',
      fileCount: null,
      errorCount: null,
      reason: `${cmd} not available (${out.spawnError})`,
      issues: [],
      durationMs: Date.now() - start,
    };
  }

  const status: ValidatorResult['status'] = out.exitCode === 0 ? 'pass' : 'fail';
  const label = stack.hasVitest ? 'Vitest' : 'Tests';
  if (status === 'pass') {
    return {
      id: 'test',
      label,
      status,
      scope: './',
      fileCount: null,
      errorCount: 0,
      reason: null,
      issues: [],
      durationMs: Date.now() - start,
    };
  }
  // On failure surface a tail of stderr (capped) so consumers see the
  // first failing test without re-running.
  const tail = (out.stderr + '\n' + out.stdout).trim().slice(-500);
  return {
    id: 'test',
    label,
    status,
    scope: './',
    fileCount: null,
    errorCount: 1,
    reason: `${cmd} test exited ${out.exitCode ?? '?'}`,
    issues: [
      {
        file: stack.root,
        line: null,
        message: tail || `${cmd} test failed`,
      },
    ],
    durationMs: Date.now() - start,
  };
}

interface CaptureResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  spawnError: string | null;
}

function runCapture(cmd: string, args: readonly string[], cwd: string): Promise<CaptureResult> {
  return new Promise((resolveOuter) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, { cwd, shell: false });
    } catch (err) {
      resolveOuter({
        exitCode: null,
        stdout: '',
        stderr: '',
        spawnError: (err as Error).message,
      });
      return;
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      resolveOuter({
        exitCode: null,
        stdout,
        stderr,
        spawnError: err.message,
      });
    });
    child.on('close', (code) => {
      resolveOuter({ exitCode: code, stdout, stderr, spawnError: null });
    });
  });
}
