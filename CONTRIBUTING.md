# Contributing to CIR

Welcome. CIR — **Capability · Intent · Render** — is a production architecture for dynamic software interfaces. Before you write a single line, read [`ETHOS.md`](ETHOS.md). The ten principles answer most design questions you will run into; the ones they don't deserve a discussion in an issue, not a unilateral patch.

This document covers the mechanics. The substance — how to think about capabilities, skills, intent, manifests, triggers — lives in [`ETHOS.md`](ETHOS.md), [`AGENTS.md`](AGENTS.md), and [`docs/`](docs/).

## Dev setup

CIR uses Node 22 and pnpm 10. The repo pins both.

```bash
# Use the pinned Node version (.nvmrc).
nvm use            # or: fnm use, asdf install, volta install node

# Enable Corepack so pnpm@10 is available without a global install.
corepack enable

# Install dependencies.
pnpm install
```

Husky hooks install automatically via the `prepare` script. Don't bypass them with `--no-verify` — if a hook fails, fix the underlying issue.

## Common commands

| Command              | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `pnpm validate`      | Runs typecheck, lint, format-check, and tests. Run this before opening a PR. |
| `pnpm validate:fast` | Fast local check (everything except tests); used by the pre-push hook.       |
| `pnpm test`          | Vitest, single-pass.                                                         |
| `pnpm test:watch`    | Vitest in watch mode.                                                        |
| `pnpm test:coverage` | Vitest with V8 coverage.                                                     |
| `pnpm typecheck`     | `tsc --build` across the workspace.                                          |
| `pnpm lint`          | ESLint over the repo.                                                        |
| `pnpm lint:fix`      | ESLint with autofix.                                                         |
| `pnpm format`        | Prettier write.                                                              |
| `pnpm format:check`  | Prettier check (used in CI).                                                 |
| `pnpm build`         | Recursive workspace build (where present).                                   |

GitHub Actions workflows are validated by [actionlint](https://github.com/rhysd/actionlint) in CI; pre-validate locally with `actionlint .github/workflows/*.yml` if editing workflow files.

## Branches

Branch off `main`. Use one of these prefixes — CI and review tooling key off them:

- `feat/<short-slug>` — new capability, skill, component, policy, or recipe
- `fix/<short-slug>` — bug fix in existing artifact or runtime
- `docs/<short-slug>` — docs-only changes
- `chore/<short-slug>` — tooling, CI, dependency bumps, repo hygiene

Keep branches scoped. A branch that touches a capability schema, a runtime component, and the build plan is three branches.

## Commits

CIR uses [Conventional Commits](https://www.conventionalcommits.org/). The commit-msg hook enforces the format, so you'll find out fast if you forget.

Conventional commit format is enforced in three places: the local `commit-msg` hook (per-commit), the `.github/workflows/commitlint.yml` action (validates the commit range AND the PR title on every push), and the local `pre-push` hook running `pnpm validate:fast` (everything except tests). The full test suite runs in CI.

```
<type>(<optional scope>): <subject>

<optional body>

<optional footer(s)>
```

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`. Use `feat!:` (or a `BREAKING CHANGE:` footer) when shipping a breaking change — particularly for capability schema bumps, component removals, or policy rule changes that affect existing manifests.

Examples:

```
feat(capabilities): add calendar.list_events with 90-day window
fix(runtime): respect policy.confirm on destructive actions
docs(ethos): clarify principle 7 — runtime is dumb on purpose
chore(deps): bump vitest to 2.1.8
```

## Pull request checklist

Before requesting review:

- [ ] `pnpm validate` passes locally.
- [ ] New or changed code has tests; capability changes have eval cases (`/evals/capabilities/*.eval.ts`).
- [ ] Types are honest — no `any` to silence the compiler, no `// @ts-expect-error` without a comment explaining why.
- [ ] Lint and Prettier pass; no ad-hoc disable comments without justification.
- [ ] Docs updated when behavior changes — at minimum, the affected file under [`docs/`](docs/).
- [ ] Schema changes bump versions and ship migration notes (see [`AGENTS.md`](AGENTS.md) hard rules 2 and 3).
- [ ] Components are append-only; deprecations have a 90-day window.
- [ ] Every action declares `side_effects`, `permissions`, and `reversibility`.
- [ ] Generated manifests still validate against `/policies/`.
- [ ] Changes respect the ten principles in [`ETHOS.md`](ETHOS.md). If a principle is in tension, name it in the PR description.

## Where things live

The canonical layout — `/capabilities/`, `/skills/`, `/components/`, `/policies/`, `/recipes/`, `/evals/`, `/runtime/`, `/compiler/`, `/packages/`, `/.well-known/cir.json` — and the rules for each are documented in [`AGENTS.md`](AGENTS.md). That file is authoritative; this one points to it.

## Adding a capability, skill, or component

The procedures live in [`AGENTS.md`](AGENTS.md):

- Adding a capability: see _"When asked to add a capability"_.
- Adding a component: see _"When asked to add a component"_.
- Adding a skill: define it alongside its capability under `/skills/{name}.skill.md` and reference it from the capability's eval cases.

Don't write UI for a new capability. UI is generated. If you find yourself reaching for hand-written components, re-read principle 1.

## License

CIR is licensed under the [MIT License](LICENSE). By submitting a contribution, you agree that your contribution is licensed under the same terms. The [`NOTICE`](NOTICE) file records the project's attribution; preserve it in derivative works.

## Code of Conduct

Participation in this project is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md). Report concerns to the address listed there.
