// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_PATH = resolve(import.meta.dirname, '..', 'src', 'cli', 'index.ts');
const FIXTURES_DIR = resolve(import.meta.dirname);

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runCli(args: readonly string[], cwd: string): Promise<SpawnResult> {
  return new Promise((resolveOuter, rejectOuter) => {
    const child = spawn(process.execPath, ['--import=tsx/esm', CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', rejectOuter);
    child.on('close', (code) => {
      resolveOuter({ stdout, stderr, exitCode: code });
    });
  });
}

describe('cir-evals CLI', () => {
  it('exits 1 when fixtures include failures', async () => {
    const result = await runCli(['run', '--pattern', 'fixtures/**/*.eval.ts'], FIXTURES_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('PASS');
    expect(result.stdout).toContain('FAIL');
  }, 30_000);

  it('exits 0 when --filter matches nothing', async () => {
    const result = await runCli(
      ['run', '--pattern', 'fixtures/**/*.eval.ts', '--filter', 'absolutely-no-match'],
      FIXTURES_DIR,
    );
    expect(result.exitCode).toBe(0);
  }, 30_000);

  it('emits valid JSON with --reporter json', async () => {
    const result = await runCli(
      [
        'run',
        '--pattern',
        'fixtures/**/*.eval.ts',
        '--filter',
        'fixture/pass',
        '--reporter',
        'json',
      ],
      FIXTURES_DIR,
    );
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.split('\n').filter((l) => l.length > 0);
    // Each line is a self-contained JSON record.
    for (const line of lines) {
      expect(() => {
        JSON.parse(line);
      }).not.toThrow();
    }
    const summaryLine = lines.find((l) => l.includes('"type":"summary"'));
    expect(summaryLine).toBeDefined();
  }, 30_000);

  it('exits 1 and prints usage on unknown command', async () => {
    const result = await runCli(['nope'], FIXTURES_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('usage:');
  }, 30_000);
});
