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
| `cir dev --tail`                | Spawn `next dev` AND tail audit events from `/api/cir/audit/stream` to stderr.                        |
| `cir dev --tail-only`           | Skip the spawn, just tail the audit stream.                                                           |
| `cir add <component>`           | Copy a baseline component from `@cir/components` source into `./components/`.                         |
| `cir add --list`                | List every available baseline component.                                                              |
| `cir components-sync [--check]` | Regenerate `components/registry.json` from the live `@cir/components` registry.                       |
| `cir validate`                  | Run the host project's `pnpm validate` chain.                                                         |
| `cir import openapi <spec>`     | Generate `capabilities/` from an OpenAPI 3.x spec (drafts with `_review` envelopes).                  |
| `cir inspect <id-or-path>`      | Pretty-print a manifest from a file path or via `<server>/api/cir/manifest/<id>`.                     |
| `cir compile <intent.json>`     | Offline compile producing a manifest. Mirrors the demo's server wiring.                               |
| `cir --help`                    | Print top-level usage. `cir <cmd> --help` prints subcommand usage.                                    |
| `cir --version`                 | Print the `@cir/cli` version.                                                                         |

## `cir inspect` — manifest pretty-printer

Two input modes:

```bash
# File path
cir inspect ./fixtures/manifest.json

# Live id (looks up via dev server, default http://localhost:3000)
cir inspect m_a7b3c9d1
cir inspect m_a7b3c9d1 --server http://localhost:4001

# Dump JSON instead of the tree
cir inspect ./fixtures/manifest.json --json
```

Output is color-cued via raw ANSI escapes (no `chalk` dep). `--no-color`
suppresses escapes; the CLI auto-suppresses when stdout is not a TTY.

## `cir compile` — offline compile

Reads intent + capabilities + skills + components from disk and produces a
`Manifest`. Mirrors `apps/demo/lib/cir-server.ts`:

```bash
cir compile fixtures/intent.json \
  --capabilities capabilities/ \
  --skills skills/ \
  --components components/registry.json \
  --brand-kit brand.json \
  --route /today \
  --out manifest.json
```

If `GEMINI_API_KEY` is set, the run goes through `GeminiCompiler` wrapped in a
`CompositeCompiler` over `FallbackCompiler`. Without a key, the fallback alone
runs and a one-line note hits stderr — the API key is **never** logged, even
in error paths (defensive `AIza`-prefix redaction is applied to all messages).

## `cir dev --tail` — terminal-side audit observability

Streams audit events from a running CIR dev server's
`/api/cir/audit/stream` SSE endpoint:

```
[12:34:56] compile.ok       m_a7b3c9d1   1234tk
[12:34:57] policy.fail      reversibility_surfaced   issue.create
[12:34:58] action.executed  thread.archive  user=demo-user
```

Color bands map by severity. Reconnect schedule is capped exponential backoff
(1s, 2s, 4s, max 8s); a single `note: reconnecting...` line prints per
disconnect, not a flood. If the audit endpoint is unreachable on first
connect, the CLI prints a one-line note and exits cleanly — the contract is
that demos opt in by implementing the endpoint, and `cir dev --tail` never
fabricates it.

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
