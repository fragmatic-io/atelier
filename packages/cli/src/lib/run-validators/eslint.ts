// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * ESLint runner for `atelier validate`.
 *
 * Strategy: spawn `eslint . --format json` and parse the structured output.
 * The JSON formatter is part of every ESLint release since 1.0; it's the
 * stable surface for tooling consumers. We do not try to load ESLint
 * programmatically (that would tie us to a specific major version).
 *
 * Resolution order for the `eslint` binary:
 *   1. `<root>/node_modules/.bin/eslint` (consumer-pinned).
 *   2. `eslint` on PATH.
 *
 * Skipped when no ESLint config file is detected on disk.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { DetectedStack } from '../detect-stack.js';
import type { ValidatorIssue, ValidatorResult } from './index.js';

interface EslintMessage {
  ruleId?: string | null;
  severity: number;
  message: string;
  line?: number;
  column?: number;
}

interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
  errorCount?: number;
  warningCount?: number;
}

/**
 * Run `eslint . --format json` and bucket per-file errors. Warnings (sev=1)
 * are NOT counted as failures — `atelier validate` reports the consumer's
 * configured errors only, mirroring the conventional `eslint --max-warnings`
 * behaviour.
 */
export async function runEslint(stack: DetectedStack): Promise<ValidatorResult> {
  const start = Date.now();
  if (!stack.hasEslint) {
    return {
      id: 'lint',
      label: 'ESLint',
      status: 'skip',
      scope: './',
      fileCount: null,
      errorCount: null,
      reason: 'no eslint config',
      issues: [],
      durationMs: Date.now() - start,
    };
  }

  const localBin = join(stack.root, 'node_modules', '.bin', 'eslint');
  const cmd = existsSync(localBin) ? localBin : 'eslint';
  const args = ['.', '--format', 'json'];

  const out = await runCapture(cmd, args, stack.root);
  if (out.spawnError) {
    return {
      id: 'lint',
      label: 'ESLint',
      status: 'skip',
      scope: './',
      fileCount: null,
      errorCount: null,
      reason: `eslint not available (${out.spawnError})`,
      issues: [],
      durationMs: Date.now() - start,
    };
  }

  // ESLint writes the JSON formatter to stdout; non-fatal config noise can
  // hit stderr on some configs. We tolerate trailing whitespace.
  const raw = out.stdout.trim();
  if (raw === '') {
    // ESLint may exit non-zero without producing JSON when it can't load
    // the config (e.g. flat-config syntax error). Surface as a fail.
    if (out.exitCode === 0) {
      return {
        id: 'lint',
        label: 'ESLint',
        status: 'pass',
        scope: './',
        fileCount: 0,
        errorCount: 0,
        reason: null,
        issues: [],
        durationMs: Date.now() - start,
      };
    }
    return {
      id: 'lint',
      label: 'ESLint',
      status: 'fail',
      scope: './',
      fileCount: null,
      errorCount: 1,
      reason: 'eslint failed to produce JSON',
      issues: [
        {
          file: stack.root,
          line: null,
          message: out.stderr.trim().slice(0, 500) || `eslint exited ${out.exitCode ?? '?'}`,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  let parsed: EslintFileResult[];
  try {
    parsed = JSON.parse(raw) as EslintFileResult[];
  } catch (err) {
    return {
      id: 'lint',
      label: 'ESLint',
      status: 'fail',
      scope: './',
      fileCount: null,
      errorCount: 1,
      reason: 'eslint output unparseable',
      issues: [
        {
          file: stack.root,
          line: null,
          message: (err as Error).message,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  const issues: ValidatorIssue[] = [];
  let totalErrors = 0;
  for (const file of parsed) {
    for (const msg of file.messages) {
      if (msg.severity !== 2) continue; // warnings only — skip
      totalErrors++;
      issues.push({
        file: file.filePath,
        line: msg.line ?? null,
        message: msg.ruleId ? `${msg.ruleId}: ${msg.message}` : msg.message,
      });
    }
  }

  const status: ValidatorResult['status'] = totalErrors === 0 ? 'pass' : 'fail';
  return {
    id: 'lint',
    label: 'ESLint',
    status,
    scope: './',
    fileCount: parsed.length,
    errorCount: totalErrors,
    reason: status === 'fail' ? `${totalErrors} error(s)` : null,
    issues,
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
