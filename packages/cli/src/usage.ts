// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Usage strings for the `atelier` CLI. Kept in a dedicated module so the
 * top-level help and per-subcommand help share wording.
 */

export const TOP_LEVEL_USAGE = `usage: atelier <command> [options]

Commands:
  init [dir]              Scaffold a new Atelier app in [dir] (defaults to '.').
  dev                     Start the dev server (delegates to 'next dev').
                          --tail / --tail-only stream audit events to stderr.
  add <component>         Copy a baseline component into ./components/.
  components-sync         Regenerate components/registry.json from @atelier/components.
  validate                Run typecheck, lint, tests, and Atelier schema checks (--strict, --json, --only).
  lint skill <path>       Validate a single .skill.md file (YAML + SkillSchema).
  import openapi <spec>   Generate capabilities/ from an OpenAPI 3.x spec.
  import figma <tokens>   Generate a BrandKit JSON from a Figma tokens export.
  inspect <id-or-path>    Pretty-print a manifest (file path or live id).
  compile <intent.json>   Offline compile producing a manifest.
  vault dev               Boot a local intent vault server (ed25519 JWTs).
  marketplace publish     Publish a signed bundle to the vault marketplace.
  marketplace review      Submit a maintainer review for a marketplace bundle.

Options:
  --help, -h              Show this message.
  --version, -v           Print the @atelier/cli version.

Run 'atelier <command> --help' for command-specific options.`;

export const INIT_USAGE = `usage: atelier init [dir] [--host=next15|vite] [--mode=standalone|monorepo]
                                [--package-manager=pnpm|npm|yarn] [--no-install]
                                [--description "..."]

Scaffold a new Atelier app. [dir] defaults to '.'.

Modes (auto-detected unless --mode is passed):
  standalone   Default outside the Atelier monorepo. Copies a host template
               (Next.js 15 App Router or Vite + React 19) plus a starter kit
               of recipes/, policies/, capabilities/, skills/, brand-kit.json,
               .env.local.example into the target directory. @atelier/* deps
               point at npm versions, NOT workspace:*.
  monorepo     Auto-selected when the cwd is inside this repo. Preserves the
               legacy single-file Next.js scaffold the demo grew up on.

Standalone-mode flags:
  --host <h>            'next15' (default) or 'vite'.
  --package-manager <p> 'pnpm' (default), 'npm', or 'yarn'. Used for the
                        post-scaffold install.
  --no-install          Skip the post-scaffold install step. Useful in CI.
  --description "..."   Short project description; lands in package.json
                        and README.

Both modes:
  --mode <m>            Force 'standalone' or 'monorepo' (overrides detection).
  --help                Show this message.`;

export const DEV_USAGE = `usage: atelier dev [--tail | --tail-only] [--audit-url <url>] [--no-color] [-- next-args...]

Thin wrapper around 'next dev'. Any args after '--' are forwarded.

  --tail              Spawn next dev AND tail audit events to stderr.
  --tail-only         Skip next, just tail audit events. Useful when the
                      dev server is already running in another terminal.
  --audit-url <url>   Audit SSE endpoint. Default
                      http://localhost:3000/api/cir/audit/stream.
  --no-color          Suppress ANSI color escapes.

Reconnect schedule: capped exponential (1s, 2s, 4s, 8s).`;

export const ADD_USAGE = `usage: atelier add <component>

Copy a baseline component from @atelier/components into ./components/.
Use 'atelier add --list' to see available components.`;

export const COMPONENTS_SYNC_USAGE = `usage: atelier components-sync [--check]

Regenerate components/registry.json from @atelier/components. With --check,
exit non-zero if the on-disk file is stale.`;

export const VALIDATE_USAGE = `usage: atelier validate [--strict] [--json] [--only=<set>]

Detect the consumer's stack (TypeScript, ESLint, Vitest, package
manager) and run the appropriate checks inline. Skipped checks (no
eslint config, etc.) are labelled rather than failing.

Checks, in order:
  typecheck      'tsc --noEmit' if a tsconfig is present.
  lint           'eslint .' if an ESLint config is present.
  test           Consumer's 'test' script via the detected package
                 manager (pnpm/npm/yarn).
  capabilities   capabilities/*.json against CapabilitySchema.
  skills         skills/**/*.skill.md against SkillSchema (YAML +
                 frontmatter).
  policies       policies/*.json against PolicySchema.
  brand kit      brand-kit.json against BrandKitSchema.
  recipes        recipes/*.json against ManifestSchema.
  components     components/registry.json against ComponentRegistrySchema.

Flags:
  --strict       Fail on skipped checks (CI mode).
  --json         Emit a stable JSON payload instead of the human table.
  --only=<set>   Comma-separated subset. Tokens: typecheck, lint, test,
                 schemas (expands to all six Atelier validators), or any
                 individual check id.

Exit codes: 0 = pass, 1 = check failed, 2 = no package.json at cwd.`;

export const LINT_USAGE = `usage: atelier lint <target> [args...]

Per-file linters that front-run validation. Today only one target ships:

  skill <path>     Validate a single .skill.md file (YAML + SkillSchema).

Run 'atelier lint <target> --help' for target-specific options.`;

export const LINT_SKILL_USAGE = `usage: atelier lint skill <path> [--json]

Run parseSkillMarkdown against a single .skill.md file and report any
errors in a developer-actionable format. Exits 0 when the file is clean,
1 otherwise.

  --json    Emit the structured result as JSON instead of human text.
            Stable shape: { file, ok, issues: [{ kind, message,
            line, column, path, snippet }] }.

Error categories:

  yaml      Malformed YAML frontmatter. Reports 1-based line / column
            and a snippet of the offending line.
  schema    Frontmatter parsed but failed SkillSchema. Reports the
            offending JSON path and Zod's message.
  io        File missing or unreadable.`;

export const INSPECT_USAGE = `usage: atelier inspect <manifest-id-or-path> [--server <url>] [--json] [--no-color]

Pretty-print a manifest. Two input modes:

  ./fixtures/manifest.json    Read directly from disk.
  m_a7b3c9d1                  Look up via dev server.

  --server <url>      Base URL when looking up by id.
                      Default http://localhost:3000.
  --json              Dump the parsed manifest as pretty JSON instead.
  --no-color          Suppress ANSI color escapes (auto when stdout is not a TTY).`;

export const COMPILE_USAGE = `usage: atelier compile <intent.json> [--capabilities <dir>] [--skills <dir>]
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

export const VAULT_DEV_USAGE = `usage: atelier vault dev [--port 4001] [--db <path>] [--issuer <url>]

Boot a local Atelier intent vault server (see @atelier/vault-server). Uses
node:http; persists profiles + grants to a JSON file; signs tokens with
ed25519.

  --port <n>         Port to bind. Default 4001.
  --db <path>        Storage file. Default ./.cir-vault.json (cwd-relative).
  --issuer <url>     Issuer claim placed in minted tokens. Default
                     http://localhost:<port>.

Set VAULT_SIGNING_KEY_PEM to a PKCS#8 ed25519 PEM to persist the signing
key across restarts. Without it, an ephemeral pair is generated and the
PEM is printed to stderr — every restart invalidates outstanding tokens.

JWKS lives at /.well-known/jwks.json; protocol spec at
docs/vault-protocol.md.`;

export const MARKETPLACE_PUBLISH_USAGE = `usage: atelier marketplace publish <bundle.json> --author <id> --key <path>
                                          [--vault-url <url>] [--app-id <id>]

Sign a marketplace bundle and POST it to the vault's
\`/marketplace/persona\` endpoint (V-6.a / V-6.f).

Bundle JSON shape (pre-signing):
  {
    "address": "atelier://<author>/<persona>@<version>",
    "payload": { ... }
  }

Required:
  --author <id>      Author handle. Must match the bundle's address.author.
  --key <path>       Path to PKCS#8 PEM ed25519 private key file.

Optional:
  --vault-url <url>  Vault base URL. Default http://localhost:4001.
  --app-id <id>      VaultClient app id. Default cir.cli.

On success, prints the canonical \`atelier://...\` address. On failure,
prints the underlying error and exits 1.`;

export const MARKETPLACE_REVIEW_USAGE = `usage: atelier marketplace review <address>
                                          --state <approved|rejected|flagged>
                                          --reviewer <id> --key <pkcs8.pem>
                                          [--notes <text>] [--vault-url <url>]

Submit a maintainer review for a marketplace bundle (V-6.d). The bundle
must already be published; the server-side \`ReviewerKeyDirectory\` must
list the public key matching \`--key\`.

Required:
  <address>            \`atelier://<author>/<persona>@<version>\` URI.
  --state <s>          One of: approved, rejected, flagged. (\`pending\` is
                       server-only — auto-applied at publish time.)
  --reviewer <id>      Reviewer handle. Must match the directory entry.
  --key <path>         Path to PKCS#8 PEM ed25519 private key file.

Optional:
  --notes <text>       Human-readable note attached to the record.
  --vault-url <url>    Vault base URL. Default http://localhost:4001.
  --app-id <id>        VaultClient app id. Default cir.cli.

On success, prints the persisted state + address. On failure (401 unknown
reviewer, 404 missing bundle, 400 schema fail), prints the underlying
error and exits 1.`;
