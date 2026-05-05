// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * TypeScript runner for `atelier validate`.
 *
 * Strategy: spawn the consumer's `tsc --noEmit` and parse the output for
 * the conventional `<file>(<line>,<col>): error TS<code>: <message>` shape.
 * `tsc` is the only canonical typechecker — we don't try to support
 * tsserver or `tsd`.
 *
 * Resolution order for the `tsc` binary:
 *   1. `<root>/node_modules/.bin/tsc` (consumer-pinned).
 *   2. `tsc` on PATH (global / asdf / volta / corepack shim).
 *
 * If neither resolves, the runner returns `skip` with a clear reason. We
 * intentionally do NOT fall back to a bundled TypeScript — the CLI ships
 * lean and the consumer picks their own version.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { DetectedStack } from '../detect-stack.js';
import type { ValidatorIssue, ValidatorResult } from './index.js';

const TSC_DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error TS\d+: (.+)$/u;

/**
 * Run `tsc --noEmit` against the consumer's project. Reports per-file
 * issues; collapses pure tool-level failures (binary not found, exit code
 * with no parsed diagnostics) into a single tool-level entry.
 */
export async function runTypecheck(stack: DetectedStack): Promise<ValidatorResult> {
  const start = Date.now();
  if (!stack.hasTypeScript) {
    return {
      id: 'typecheck',
      label: 'TypeScript',
      status: 'skip',
      scope: './',
      fileCount: null,
      errorCount: null,
      reason: 'no tsconfig.json',
      issues: [],
      durationMs: Date.now() - start,
    };
  }

  const localBin = join(stack.root, 'node_modules', '.bin', 'tsc');
  const cmd = existsSync(localBin) ? localBin : 'tsc';

  const out = await runCapture(cmd, ['--noEmit', '--pretty', 'false'], stack.root);
  const issues: ValidatorIssue[] = [];
  const filesTouched = new Set<string>();
  const text = `${out.stdout}\n${out.stderr}`;
  for (const line of text.split(/\r?\n/u)) {
    const m = TSC_DIAGNOSTIC.exec(line);
    if (m) {
      const fileRel = m[1] ?? '';
      const ln = m[2] ?? '0';
      const message = m[4] ?? '';
      const abs = fileRel.startsWith('/') ? fileRel : join(stack.root, fileRel);
      filesTouched.add(abs);
      issues.push({ file: abs, line: Number(ln) || null, message });
    }
  }

  if (out.spawnError) {
    return {
      id: 'typecheck',
      label: 'TypeScript',
      status: 'skip',
      scope: './',
      fileCount: null,
      errorCount: null,
      reason: `tsc not available (${out.spawnError})`,
      issues: [],
      durationMs: Date.now() - start,
    };
  }

  const status: ValidatorResult['status'] =
    out.exitCode === 0 && issues.length === 0 ? 'pass' : 'fail';
  // If tsc exited non-zero with no parsed diagnostics, surface the raw
  // stderr as a single tool-level issue so the consumer isn't left guessing.
  if (status === 'fail' && issues.length === 0) {
    issues.push({
      file: stack.root,
      line: null,
      message: text.trim().slice(0, 500) || `tsc exited ${out.exitCode ?? '?'}`,
    });
  }
  // Best-effort file count: use the unique file set from diagnostics, or
  // fall back to the count of TS files we'd nominally typecheck.
  const fileCount = filesTouched.size > 0 ? filesTouched.size : null;

  return {
    id: 'typecheck',
    label: 'TypeScript',
    status,
    scope: relative(stack.root, stack.root) || './',
    fileCount,
    errorCount: issues.length,
    reason: status === 'fail' ? `${issues.length} error(s)` : null,
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
