// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-rolled argv parser for the `cir` CLI. Mirrors the conventions used by
 * `cir-schemas` and `cir-evals`: no external libraries, supports
 * `--flag value`, `--flag=value`, and bare boolean flags. Positional args
 * (everything before the first `--flag`) are returned in `positionals`.
 */

export interface ParsedArgs {
  /** Subcommand name, e.g. `init`, `dev`. Empty string when none was given. */
  command: string;
  /** Positional args after the subcommand, in order. */
  positionals: string[];
  /** Flag map. Boolean flags resolve to `'true'`. */
  flags: Record<string, string>;
}

/**
 * Parse `process.argv.slice(2)` into a `{command, positionals, flags}`
 * triple. Tolerates `--flag value`, `--flag=value`, and bare boolean flags.
 *
 * Top-level `--help` / `--version` are special: they are returned as the
 * `command` (e.g. `'--help'`) so the router can dispatch to them without
 * tripping the "unknown subcommand" branch.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0) {
    return { command: '', positionals: [], flags: {} };
  }
  // Top-level help/version flags act as commands.
  const head = argv[0] ?? '';
  if (head === '--help' || head === '-h') {
    return { command: '--help', positionals: [], flags: {} };
  }
  if (head === '--version' || head === '-v') {
    return { command: '--version', positionals: [], flags: {} };
  }
  const command = head;
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith('--')) {
      const eqIdx = a.indexOf('=');
      if (eqIdx > -1) {
        // --key=value form
        const key = a.slice(2, eqIdx);
        const value = a.slice(eqIdx + 1);
        flags[key] = value;
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positionals.push(a);
    }
  }
  return { command, positionals, flags };
}
