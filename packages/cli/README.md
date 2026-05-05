# `@atelier/cli`

Unified developer CLI for Atelier (Capability · Intent · Render). Wraps the
schema, eval, and component tooling under one entry point.

```bash
pnpm atelier <command> [options]
```

## Commands

| Command                             | What it does                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `atelier init <name>`               | Scaffold a new Atelier app. Standalone by default, monorepo-aware when run inside this repo.           |
| `atelier dev`                       | Start the dev server. Thin wrapper around `next dev`.                                                  |
| `atelier dev --tail`                | Spawn `next dev` AND tail audit events from `/api/cir/audit/stream` to stderr.                         |
| `atelier dev --tail-only`           | Skip the spawn, just tail the audit stream.                                                            |
| `atelier add <component>`           | Copy a baseline component from `@atelier/components` source into `./components/`.                      |
| `atelier add --list`                | List every available baseline component.                                                               |
| `atelier components-sync [--check]` | Regenerate `components/registry.json` from the live `@atelier/components` registry.                    |
| `atelier validate`                  | Detect the consumer's stack and run typecheck, lint, tests, plus Atelier schema validation.            |
| `atelier lint skill <path>`         | Validate a single `.skill.md` file. Surfaces YAML line/column on parse failure.                        |
| `atelier import openapi <spec>`     | Generate `capabilities/` from an OpenAPI 3.x spec (drafts with `_review` envelopes).                   |
| `atelier import figma <tokens>`     | Generate a `BrandKit` JSON from a W3C Design Tokens / Figma export. Stub — voice / variants stay TODO. |
| `atelier inspect <id-or-path>`      | Pretty-print a manifest from a file path or via `<server>/api/cir/manifest/<id>`.                      |
| `atelier compile <intent.json>`     | Offline compile producing a manifest. Mirrors the demo's server wiring.                                |
| `atelier --help`                    | Print top-level usage. `atelier <cmd> --help` prints subcommand usage.                                 |
| `atelier --version`                 | Print the `@atelier/cli` version.                                                                      |

## `atelier init` — standalone scaffold (Sprint 1.1)

Two modes, auto-detected by `cwd`:

- **standalone** (the default outside the Atelier monorepo). Copies a host
  template plus a starter kit (`recipes/`, `policies/`, `capabilities/`,
  `skills/`, `brand-kit.json`, `.env.local.example`) into the target
  directory. `@atelier/*` deps point at npm versions, NOT `workspace:*`.
- **monorepo** (auto-selected when invoked inside this repo). Preserves
  the legacy single-file Next.js scaffold the demo grew up on.

```bash
# Fresh standalone Next.js 15 app (default host)
npx -y @atelier/cli init my-app
cd my-app && pnpm dev   # boots vault + next dev

# Vite + React 19
npx -y @atelier/cli init my-app --host=vite

# Skip the post-scaffold install (handy for CI)
npx -y @atelier/cli init my-app --no-install

# Pick a specific package manager (default pnpm)
npx -y @atelier/cli init my-app --package-manager=npm

# Force a mode (overrides auto-detection)
atelier init my-app --mode=standalone
```

Templates live under `packages/cli/templates/<host>/` as `*.template`
files; the `_shared/` tree carries the recipe / policy / capability /
skill / brand-kit / env starters that every host gets. The
`{{appName}}` and `{{description}}` placeholders are substituted at
scaffold time. Files that aren't `*.template` are copied verbatim, which
is how the JSON / Markdown starters keep their literal `{{...}}` out of
the substitution loop.

The scaffolded `package.json` lists every `@atelier/*` dep at `^0.5.0`
(the current published version), so `pnpm install` works against the
public npm registry. The
`scripts/smoke-test-init.ts` CI gate packs each `@atelier/*` package
locally, rewrites the scaffold to point at the tarballs via
`pnpm.overrides`, runs `pnpm install`, and then `tsc --noEmit` — proving
the typecheck path before any external publish.

## `atelier validate` — pre-flight checks for the consumer project

Detects the consumer's stack (TypeScript, ESLint, Vitest, package
manager) and runs the appropriate checks inline, regardless of whether
the project is a single-package app or a workspace monorepo. Replaces
the Wave 2 shell-out to `pnpm validate`, which broke for any external
consumer who installed `@atelier/cli` from npm.

```bash
atelier validate
# atelier validate
# ────────────────────────────────────────
# PASS  TypeScript      ./                 12 file(s), 0 error(s)
# PASS  ESLint          ./                 42 file(s), 0 error(s)
# PASS  Vitest          ./                 ok
# PASS  Capabilities    ./capabilities/    4 file(s), 0 error(s)
# PASS  Skills          ./skills/          2 file(s), 0 error(s)
# PASS  Policies        ./policies/        3 file(s), 0 error(s)
# SKIP  Brand kit       ./brand-kit.json   skipped (no brand-kit.json)
# SKIP  Recipes         ./recipes/         skipped (no recipes/ directory)
# SKIP  Components      ./components/registry.json  skipped (no components/registry.json)
# ────────────────────────────────────────
# PASS  All checks passed (6/9)
```

Skipped checks (no eslint config, no test script, etc.) are labelled
rather than failing. Use `--strict` in CI to flip that — every check
must run, or the command fails.

```bash
# CI mode: skipped checks become failures.
atelier validate --strict

# Subset: typecheck + lint only.
atelier validate --only=typecheck,lint

# Subset: just the Atelier schema checks.
atelier validate --only=schemas

# Machine-readable output (stable shape: { ok, strict, results[] }).
atelier validate --json
```

Exit codes:

- `0` — all detected checks passed.
- `1` — at least one check failed (or skipped under `--strict`).
- `2` — configuration error (no `package.json` at cwd).

Detection signals:

- **TypeScript** — `tsconfig.json` (or `tsconfig.base.json`).
- **ESLint** — `eslint.config.{js,mjs,cjs,ts}` or any `.eslintrc.*`.
- **Vitest** — `vitest.config.*` OR a `test` script that invokes `vitest`.
- **Tests** — any `test` script in `package.json` (other than the
  conventional `echo "Error: no test specified"` placeholder).
- **Package manager** — `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn,
  `package-lock.json` → npm. Defaults to `npm` when no lockfile exists.
- **Monorepo** — `pnpm-workspace.yaml` (pnpm), or `workspaces` in
  `package.json` (npm/yarn, differentiated by lockfile).

Atelier-specific schema validation is always run when the relevant
artefacts are present at the project root: `capabilities/*.json` →
`CapabilitySchema`, `skills/**/*.skill.md` → `SkillSchema`,
`policies/*.json` → `PolicySchema`, `recipes/*.json` → `ManifestSchema`,
`brand-kit.json` → `BrandKitSchema`, `components/registry.json` →
`ComponentRegistrySchema`. Failures show the file + line + reason; the
`--json` output exposes the full Zod issue path.

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

`atelier validate` runs the Atelier-specific schema checks (capabilities,
skills, policies, recipes, brand kit, components/registry.json) inline
using `@atelier/schemas` Zod schemas — same source of truth as
`atelier-schemas validate-data`. The `tsc` / `eslint` / `vitest` checks
are spawned against the consumer's locally pinned binaries.

## Limitations

- `atelier init` standalone mode landed in Sprint 1.1 for Next.js 15 and
  Vite + React 19. `atelier components-sync` still assumes the monorepo
  layout — Sprint 1.3 scope.
- `atelier dev` is intentionally a thin shell-out wrapper; it does not
  pre-flight the host project. (`atelier validate` ships a real
  pre-flight as of Sprint 1.2.)

## Conventions

Argv parsing is hand-rolled — no commander, yargs, or clipanion. Subcommands
follow the same `--flag value` / `--flag=value` / bare-boolean style as the
existing `atelier-schemas` and `atelier-evals` CLIs.

Every TS file carries the MIT SPDX header:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
```
