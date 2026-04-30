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
  add <component>         Copy a baseline component into ./components/.
  components-sync         Regenerate components/registry.json from @cir/components.
  validate                Run the validate chain (typecheck, lint, schema validation).
  import openapi <spec>   Generate capabilities/ from an OpenAPI 3.x spec.

Options:
  --help, -h              Show this message.
  --version, -v           Print the @cir/cli version.

Run 'cir <command> --help' for command-specific options.`;

export const INIT_USAGE = `usage: cir init [dir]

Scaffold a new CIR app. [dir] defaults to '.'. Writes package.json,
app/page.tsx, app/layout.tsx, tsconfig.json, next.config.mjs, README.md,
and stub directories for capabilities/, skills/, components/.`;

export const DEV_USAGE = `usage: cir dev [-- next-args...]

Thin wrapper around 'next dev'. Any args after '--' are forwarded.`;

export const ADD_USAGE = `usage: cir add <component>

Copy a baseline component from @cir/components into ./components/.
Use 'cir add --list' to see available components.`;

export const COMPONENTS_SYNC_USAGE = `usage: cir components-sync [--check]

Regenerate components/registry.json from @cir/components. With --check,
exit non-zero if the on-disk file is stale.`;

export const VALIDATE_USAGE = `usage: cir validate

Run the full validate chain: license headers, typecheck, lint,
format check, components:check, schema validation, and tests.`;
