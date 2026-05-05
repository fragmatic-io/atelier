# Atelier release policy

> Closed by Sprint 1.4. Authoritative for every `@atelier/*` workspace package.

## TL;DR

- All 15 `@atelier/*` framework packages move in **lockstep** SemVer.
- `@atelier/runtime@X.Y.Z` is always paired with `@atelier/react@X.Y.Z` (same `X.Y.Z`).
- Releases are driven by `pnpm release [patch|minor|major|x.y.z]`. Dry-run by
  default; `--real` actually publishes.
- Every PR runs `pnpm publish --dry-run -r` to catch broken export maps before
  they reach npm.
- Starting version: **`0.5.0`** (signals "approaching production"). `1.0.0` is
  post-Sprint 4 per `docs/build-plan.md`.

## Why lockstep?

The framework's surface is mutually recursive — `@atelier/react` consumes
`@atelier/runtime` consumes `@atelier/policies` consumes `@atelier/schemas`.
Independent versioning would force every consumer to satisfy a 15-axis
compatibility matrix on every install, and we'd ship a broken combination
within a week. Lockstep means:

- A consumer who pins `@atelier/runtime@0.5.0` gets a coherent set the moment
  they install it. There is no "but which @atelier/policies does this need?"
- Internal `workspace:^` dependencies expand to `^X.Y.Z` at publish time, so a
  patch in any one package picks up the matching patch elsewhere.
- A breaking change in any package bumps the whole workspace. This is verbose
  but honest — a behavioural change in `@atelier/runtime` is observable
  through `@atelier/react`, so calling it a `patch` of `react` and a `minor`
  of `runtime` would just confuse downstream pinners.

The cost: every package shares a CHANGELOG entry per release. That's fine
for now — the catalog is small enough that the per-package CHANGELOG.md
files are short. Revisit if/when one package becomes meaningfully
slower-moving than the rest.

## SemVer rules (the strict reading)

Until we hit `1.0.0`:

- **Minor bumps** (`0.5.0 → 0.6.0`) MAY contain breaking changes.
  We document them as `BREAKING CHANGE:` footers in the relevant commit.
- **Patch bumps** (`0.5.0 → 0.5.1`) MUST NOT contain breaking changes. They
  are bug-fix-only — same wire format, same exported names, same return
  shapes.

After `1.0.0`:

- Standard SemVer applies — major for breaking, minor for additive, patch
  for fixes.
- Until then, treat every minor bump as a potential migration; the changelog
  documents what changed.

## Public vs internal packages

| Package                        | Status | Why                                               |
| ------------------------------ | ------ | ------------------------------------------------- |
| `@atelier/schemas`             | Public | The contract every other package depends on       |
| `@atelier/runtime`             | Public | Framework-agnostic core surface                   |
| `@atelier/react`               | Public | React adapter — provider, hooks, render walker    |
| `@atelier/components`          | Public | Baseline component catalog                        |
| `@atelier/compiler`            | Public | Manifest compiler service                         |
| `@atelier/policies`            | Public | Manifest policy validators                        |
| `@atelier/data-resolvers`      | Public | REST / OpenAPI / GraphQL data adapters            |
| `@atelier/keyboard`            | Public | Hotkey-aware action vocabulary                    |
| `@atelier/capability-resolver` | Public | Substring + tiny-model capability scoping         |
| `@atelier/recipe-resolver`     | Public | Recipe RAG store + resolvers                      |
| `@atelier/vault-client`        | Public | Typed vault wire client                           |
| `@atelier/vault-server`        | Public | Vault server (intent + marketplace)               |
| `@atelier/evals`               | Public | Eval harness + `atelier-evals` bin                |
| `@atelier/eval-marketplace`    | Public | Marketplace eval gate (used by V-6.e nightly job) |
| `@atelier/cli`                 | Public | `atelier` developer CLI                           |

The `apps/*` workspace packages (`@atelier/demo`, `@atelier/demo-github`,
`@atelier/demo-dummyjson`, `@atelier/docs`) are private — they're product
demos and the docs site, not framework surface.

## How a release happens

```bash
# Rehearse — same flow, no registry side-effects.
pnpm release patch

# Real release.
pnpm release patch --real
```

The script:

1. Checks the working tree is clean.
2. Asserts every package is at the same version (lockstep invariant).
3. Runs `pnpm validate` (full green gate; skipable with `--skip-validate`
   for emergency hotfixes — emits a loud warning).
4. Runs `pnpm smoke-test:pack` (packs the workspace as a downstream consumer
   would; gates on import + type + bin smoke. Skipable with `--skip-smoke`).
5. Bumps every public package's `version` to the next.
6. Refreshes `pnpm-lock.yaml` (lockfile-only — node_modules unchanged).
7. Stages + commits `chore(release): vX.Y.Z`.
8. Tags `vX.Y.Z`.
9. Publishes (dry-run by default, real with `--real`).
10. Pushes branch + tag if `--real`.

If `--real` is omitted the commit + tag are still created **locally**.
To back out:

```bash
git reset --hard HEAD~1
git tag -d vX.Y.Z
```

## CI dry-run gate

`.github/workflows/ci.yml` runs `pnpm publish:dry-run` (which expands to
`pnpm -r --filter "./packages/*" publish --dry-run --no-git-checks`) on
every PR, immediately after the build step.

The gate catches:

- Build artifacts missing from `dist/` (build regression).
- Files declared in `package.json` `files` array that don't exist.
- Malformed `exports` map (subpath types/runtime mismatched).
- Lockstep version drift — pnpm refuses to publish a workspace where
  `workspace:^` resolves to a missing version.
- Private-flag drift — a package that flips back to `private: true`
  prevents publish; one that flips public when it shouldn't shows up
  in the dry-run output.

If the gate fails on a PR, fix the underlying package.json + rerun
`pnpm publish:dry-run` locally before pushing.

## Per-package CHANGELOG.md

Every public package ships a `CHANGELOG.md`. The lockstep policy means
each release lands the same `## X.Y.Z` heading in every file, but the
body of each entry is package-scoped — what _this_ package shipped in
that release.

The release script does **not** auto-generate CHANGELOGs (we deliberated
and chose not to: per-package commit-history slicing produces noise).
Hand-edit the entry as part of the release PR.

## Coordination with sibling tooling

- **Sprint 1.3** is extending `scripts/smoke-test-pack.ts` to cover all 15
  packages. The release script invokes the script (not the logic) so we
  always run the latest smoke gate.
- **P2.4** (TODO band) added `pnpm publish:dry-run` as a manual smoke; CI
  now runs it on every PR.
- **P6** (TODO band) tracks per-package `API.md` + `api-extractor`. When
  that lands, the release script gains an "API drift check" step before
  publish.
