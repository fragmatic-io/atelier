# `@atelier/cli`

Unified developer CLI for Atelier (Capability · Intent · Render). Wraps the
schema, eval, and component tooling under one entry point.

```bash
pnpm atelier <command> [options]
```

## Commands

| Command                             | What it does                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `atelier init [dir]`                | Scaffold a new Atelier app in `[dir]` (defaults to `.`). Writes `package.json`, `app/`, stub directories. |
| `atelier dev`                       | Start the dev server. Thin wrapper around `next dev`.                                                     |
| `atelier dev --tail`                | Spawn `next dev` AND tail audit events from `/api/cir/audit/stream` to stderr.                            |
| `atelier dev --tail-only`           | Skip the spawn, just tail the audit stream.                                                               |
| `atelier add <component>`           | Copy a baseline component from `@atelier/components` source into `./components/`.                         |
| `atelier add --list`                | List every available baseline component.                                                                  |
| `atelier components-sync [--check]` | Regenerate `components/registry.json` from the live `@atelier/components` registry.                       |
| `atelier validate`                  | Run the host project's `pnpm validate` chain.                                                             |
| `atelier lint skill <path>`         | Validate a single `.skill.md` file. Surfaces YAML line/column on parse failure.                           |
| `atelier import openapi <spec>`     | Generate `capabilities/` from an OpenAPI 3.x spec (drafts with `_review` envelopes).                      |
| `atelier import figma <tokens>`     | Generate a `BrandKit` JSON from a W3C Design Tokens / Figma export. Stub — voice / variants stay TODO.    |
| `atelier inspect <id-or-path>`      | Pretty-print a manifest from a file path or via `<server>/api/cir/manifest/<id>`.                         |
| `atelier compile <intent.json>`     | Offline compile producing a manifest. Mirrors the demo's server wiring.                                   |
| `atelier --help`                    | Print top-level usage. `atelier <cmd> --help` prints subcommand usage.                                    |
| `atelier --version`                 | Print the `@atelier/cli` version.                                                                         |

## `atelier inspect` — manifest pretty-printer

Two input modes:

```bash
# File path
atelier inspect ./fixtures/manifest.json

# Live id (looks up via dev server, default http://localhost:3000)
atelier inspect m_a7b3c9d1
atelier inspect m_a7b3c9d1 --server http://localhost:4001

# Dump JSON instead of the tree
atelier inspect ./fixtures/manifest.json --json
```

Output is color-cued via raw ANSI escapes (no `chalk` dep). `--no-color`
suppresses escapes; the CLI auto-suppresses when stdout is not a TTY.

## `atelier lint skill` — single-file skill validator

Front-runs `parseSkillMarkdown` against one `.skill.md` file and prints
errors in a developer-actionable format. Exits 0 when the file is clean,
1 otherwise.

```bash
# Clean file
atelier lint skill skills/email-triage.skill.md
# OK  /repo/skills/email-triage.skill.md

# Malformed YAML
atelier lint skill skills/broken.skill.md
# INVALID  /repo/skills/broken.skill.md
#   yaml   4:34  unexpected end of the stream within a double quoted scalar
#          | description: "an unterminated scalar
#          |                                  ^

# Schema-invalid frontmatter
atelier lint skill skills/incomplete.skill.md
# INVALID  /repo/skills/incomplete.skill.md
#   schema /capabilities_used  Required
#   schema /when_to_use        Required
```

Use `--json` to emit a stable structured payload. The schema is:

```jsonc
{
  "file": "/abs/path",
  "ok": false,
  "issues": [
    {
      "severity": "error",
      "kind": "yaml" | "schema" | "io",
      "message": "...",
      "line": 4,           // 1-based, null for schema/io
      "column": 34,        // 1-based, null for schema/io
      "path": null,        // "/key/path" for schema, null otherwise
      "snippet": "..."     // offending source line for yaml, null otherwise
    }
  ]
}
```

The full-tree check still lives in `pnpm validate` /
`atelier-schemas validate-data`. `lint` is the fast, focused tool you
reach for after editing one file.

## `atelier compile` — offline compile

Reads intent + capabilities + skills + components from disk and produces a
`Manifest`. Mirrors `apps/demo/lib/cir-server.ts`:

```bash
atelier compile fixtures/intent.json \
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

## `atelier import figma` — Figma → BrandKit converter

Turns a W3C Design Tokens JSON export (the format the Figma "Export Design
Tokens" plugin emits) into a Atelier `BrandKit` JSON. Tokens are routed by
their dotted path:

```
color.primary           -> tokens.colors.primary
spacing.md              -> tokens.spacing.md
radius.sm               -> radius_scale.sm
shadow.lg               -> shadow_scale.lg
duration.fast           -> motion.duration_scale.fast (parsed to ms)
easing.in_out           -> motion.easing.in_out
typography.fontFamily   -> tokens.typography.font_stack
typography.size.lg      -> tokens.typography.scale.lg
typography.weight.bold  -> tokens.typography.weight.bold
```

```bash
atelier import figma tokens.json --out brand-kit.json --id myapp.brand --version 1.0.0
```

Tokens whose paths the importer doesn't recognise are listed as warnings on
stderr — review them and either retag the input or hand-edit the output.
The output is a STUB: `voice`, `variants`, `iconography`, and
`accessibility` come back empty / TODO because Figma's design-tokens format
carries no equivalent. Hand-fill those fields before publishing.

## `atelier dev --tail` — terminal-side audit observability

Streams audit events from a running Atelier dev server's
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
that demos opt in by implementing the endpoint, and `atelier dev --tail` never
fabricates it.

## Relationship to `atelier-schemas` / `atelier-evals`

`atelier` is the unified developer surface. The single-purpose CLIs still ship
and are still useful in CI:

- `atelier-schemas dump` / `atelier-schemas validate-data` (from `@atelier/schemas`)
  emit and validate JSON-Schema artifacts.
- `atelier-evals run` (from `@atelier/evals`) runs the eval suite.

`atelier validate` shells out to `pnpm validate`, which itself calls those
CLIs as part of the chain. Inside the monorepo, both styles work.

## Limitations (Wave 2)

- `atelier init` hardcodes Next.js 15. Vite support lands in Wave 3+.
- `atelier init` and `atelier components-sync` assume the Atelier monorepo layout.
  Standalone-publish hardening (npm-installable templates, no `pnpm validate`
  expectation) is Wave 3+ scope.
- `atelier dev` and `atelier validate` are intentionally thin shell-out wrappers; they
  do not (yet) pre-flight the host project.

## Conventions

Argv parsing is hand-rolled — no commander, yargs, or clipanion. Subcommands
follow the same `--flag value` / `--flag=value` / bare-boolean style as the
existing `atelier-schemas` and `atelier-evals` CLIs.

Every TS file carries the MIT SPDX header:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
```
