// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `devCommand` integration tests — focuses on the `--tail-only` short-circuit
 * (it must NOT spawn `next`). The real `next dev` spawn path is shell-out
 * glue, exercised by manual + e2e workflows; we don't unit-test it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { devCommand } from '../src/commands/dev.js';

describe('devCommand --tail-only', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('returns 0 for an unreachable audit URL without spawning next', async () => {
    // Point at a port that is essentially guaranteed not to be listening.
    // If the function tried to spawn `next`, this would fail or hang
    // entirely; instead we expect runDevTail to print the "not reachable"
    // note and exit cleanly.
    const code = await devCommand(
      [],
      { 'tail-only': 'true', 'audit-url': 'http://127.0.0.1:1/cir-cli-test' },
      process.cwd(),
    );
    expect(code).toBe(0);
    const all = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toContain('audit endpoint not reachable');
  });

  it('--help prints usage and returns 0', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const code = await devCommand([], { help: 'true' });
    expect(code).toBe(0);
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('usage: cir dev');
    expect(out).toContain('--tail');
    log.mockRestore();
  });
});
