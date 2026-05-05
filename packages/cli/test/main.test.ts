// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';
import { readCliVersion } from '../src/version.js';

describe('main()', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('prints usage and exits 0 on --help', async () => {
    const code = await main(['--help']);
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('usage: atelier');
    expect(out).toContain('init');
    expect(out).toContain('dev');
    expect(out).toContain('add');
    expect(out).toContain('components-sync');
    expect(out).toContain('validate');
    expect(out).toContain('inspect');
    expect(out).toContain('compile');
    expect(out).toContain('vault');
    expect(out).toContain('lint');
  });

  it('prints usage and exits 1 on no args', async () => {
    const code = await main([]);
    expect(code).toBe(1);
    expect(logSpy).toHaveBeenCalled();
  });

  it('prints version on --version', async () => {
    const code = await main(['--version']);
    expect(code).toBe(0);
    const expected = readCliVersion();
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain(expected);
    expect(expected).toBe('0.5.0');
  });

  it('errors on unknown command', async () => {
    const code = await main(['nope']);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain("unknown command 'nope'");
  });

  it('routes init --help to its subcommand help', async () => {
    const code = await main(['init', '--help']);
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('usage: atelier init');
  });
});
