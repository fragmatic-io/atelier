# `@cir/cli`

Unified developer CLI for CIR (Capability · Intent · Render). Wraps the
schema, eval, and component tooling under one entry point.

```bash
pnpm cir <command> [options]
```

## Commands

| Command                         | What it does                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cir init [dir]`                | Scaffold a new CIR app in `[dir]` (defaults to `.`). Writes `package.json`, `app/`, stub directories. |
| `cir dev`                       | Start the dev server. Thin wrapper around `next dev`.                                                 |
| `cir add <component>`           | Copy a baseline component from `@cir/components` source into `./components/`.                         |
| `cir add --list`                | List every available baseline component.                                                              |
| `cir components-sync [--check]` | Regenerate `components/registry.json` from the live `@cir/components` registry.                       |
| `cir validate`                  | Run the host project's `pnpm validate` chain.                                                         |
| `cir --help`                    | Print top-level usage. `cir <cmd> --help` prints subcommand usage.                                    |
| `cir --version`                 | Print the `@cir/cli` version.                                                                         |

## Relationship to `cir-schemas` / `cir-evals`

`cir` is the unified developer surface. The single-purpose CLIs still ship
and are still useful in CI:

- `cir-schemas dump` / `cir-schemas validate-data` (from `@cir/schemas`)
  emit and validate JSON-Schema artifacts.
- `cir-evals run` (from `@cir/evals`) runs the eval suite.

`cir validate` shells out to `pnpm validate`, which itself calls those
CLIs as part of the chain. Inside the monorepo, both styles work.

## Limitations (Wave 2)

- `cir init` hardcodes Next.js 15. Vite support lands in Wave 3+.
- `cir init` and `cir components-sync` assume the CIR monorepo layout.
  Standalone-publish hardening (npm-installable templates, no `pnpm validate`
  expectation) is Wave 3+ scope.
- `cir dev` and `cir validate` are intentionally thin shell-out wrappers; they
  do not (yet) pre-flight the host project.

## Conventions

Argv parsing is hand-rolled — no commander, yargs, or clipanion. Subcommands
follow the same `--flag value` / `--flag=value` / bare-boolean style as the
existing `cir-schemas` and `cir-evals` CLIs.

Every TS file carries the MIT SPDX header:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
```
