// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Usage strings for the `cir` CLI. Kept in a dedicated module so the
 * top-level help and per-subcommand help share wording.
 */

export const TOP_LEVEL_USAGE = `usage: cir <command> [options]

Commands:
  init [dir]              Scaffold a new CIR app in [dir] (defaults to '.').
  dev                     Start the dev server (delegates to 'next dev').
                          --tail / --tail-only stream audit events to stderr.
  add <component>         Copy a baseline component into ./components/.
  components-sync         Regenerate components/registry.json from @cir/components.
  validate                Run the validate chain (typecheck, lint, schema validation).
  import openapi <spec>   Generate capabilities/ from an OpenAPI 3.x spec.
  inspect <id-or-path>    Pretty-print a manifest (file path or live id).
  compile <intent.json>   Offline compile producing a manifest.

Options:
  --help, -h              Show this message.
  --version, -v           Print the @cir/cli version.

Run 'cir <command> --help' for command-specific options.`;

export const INIT_USAGE = `usage: cir init [dir]

Scaffold a new CIR app. [dir] defaults to '.'. Writes package.json,
app/page.tsx, app/layout.tsx, tsconfig.json, next.config.mjs, README.md,
and stub directories for capabilities/, skills/, components/.`;

export const DEV_USAGE = `usage: cir dev [--tail | --tail-only] [--audit-url <url>] [--no-color] [-- next-args...]

Thin wrapper around 'next dev'. Any args after '--' are forwarded.

  --tail              Spawn next dev AND tail audit events to stderr.
  --tail-only         Skip next, just tail audit events. Useful when the
                      dev server is already running in another terminal.
  --audit-url <url>   Audit SSE endpoint. Default
                      http://localhost:3000/api/cir/audit/stream.
  --no-color          Suppress ANSI color escapes.

Reconnect schedule: capped exponential (1s, 2s, 4s, 8s).`;

export const ADD_USAGE = `usage: cir add <component>

Copy a baseline component from @cir/components into ./components/.
Use 'cir add --list' to see available components.`;

export const COMPONENTS_SYNC_USAGE = `usage: cir components-sync [--check]

Regenerate components/registry.json from @cir/components. With --check,
exit non-zero if the on-disk file is stale.`;

export const VALIDATE_USAGE = `usage: cir validate

Run the full validate chain: license headers, typecheck, lint,
format check, components:check, schema validation, and tests.`;

export const INSPECT_USAGE = `usage: cir inspect <manifest-id-or-path> [--server <url>] [--json] [--no-color]

Pretty-print a manifest. Two input modes:

  ./fixtures/manifest.json    Read directly from disk.
  m_a7b3c9d1                  Look up via dev server.

  --server <url>      Base URL when looking up by id.
                      Default http://localhost:3000.
  --json              Dump the parsed manifest as pretty JSON instead.
  --no-color          Suppress ANSI color escapes (auto when stdout is not a TTY).`;

export const COMPILE_USAGE = `usage: cir compile <intent.json> [--capabilities <dir>] [--skills <dir>]
                                [--components <registry.json>] [--brand-kit <file>]
                                [--route <path>] [--app-id <id>] [--user-id <id>]
                                [--out <file>] [--json]

Offline compile producing a manifest. Mirrors the demo's server wiring.

  --capabilities <dir>     Default: capabilities/
  --skills <dir>           Default: skills/
  --components <file>      Default: components/registry.json
  --brand-kit <file>       Optional brand kit JSON.
  --route <path>           Default: '/'
  --app-id <id>            Default: cir.cli
  --user-id <id>           Default: cli-user
  --out <file>             Write to file instead of stdout.
  --json=false             Compact JSON output (default is pretty).

Without GEMINI_API_KEY the FallbackCompiler runs (heuristics, no LLM).`;
