// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/parse-args.js';

describe('parseArgs', () => {
  it('returns empty command for no args', () => {
    expect(parseArgs([])).toEqual({ command: '', positionals: [], flags: {} });
  });

  it('treats top-level --help as a command', () => {
    expect(parseArgs(['--help']).command).toBe('--help');
    expect(parseArgs(['-h']).command).toBe('--help');
  });

  it('treats top-level --version as a command', () => {
    expect(parseArgs(['--version']).command).toBe('--version');
    expect(parseArgs(['-v']).command).toBe('--version');
  });

  it('parses subcommand + positional', () => {
    const r = parseArgs(['init', 'my-app']);
    expect(r.command).toBe('init');
    expect(r.positionals).toEqual(['my-app']);
    expect(r.flags).toEqual({});
  });

  it('parses --flag value form', () => {
    const r = parseArgs(['add', 'Button', '--cwd', '/tmp']);
    expect(r.command).toBe('add');
    expect(r.positionals).toEqual(['Button']);
    expect(r.flags).toEqual({ cwd: '/tmp' });
  });

  it('parses --flag=value form', () => {
    const r = parseArgs(['add', '--cwd=/tmp', 'Button']);
    expect(r.flags).toEqual({ cwd: '/tmp' });
    expect(r.positionals).toEqual(['Button']);
  });

  it('treats bare flags as boolean true', () => {
    const r = parseArgs(['components-sync', '--check']);
    expect(r.flags).toEqual({ check: 'true' });
  });

  it('reads next non-flag token as the flag value', () => {
    // Matches the convention used by `atelier-schemas` and `atelier-evals`: any
    // token that does not start with `--` is consumed as the previous
    // flag's value. Callers that need a boolean must use `--flag=true` or
    // place the flag after every positional.
    const r = parseArgs(['add', '--list', 'Card']);
    expect(r.flags['list']).toBe('Card');
    expect(r.positionals).toEqual([]);
  });

  it('returns positionals when no flags follow', () => {
    const r = parseArgs(['init', 'first', 'second']);
    expect(r.positionals).toEqual(['first', 'second']);
    expect(r.flags).toEqual({});
  });
});
