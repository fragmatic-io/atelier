# TODO

Tracked work that intentionally did not land in earlier phases. Update as items are picked up; remove when shipped.

## Placeholders to replace before going public

- [ ] **Security contact** — `security@cir.dev` is a placeholder in [`SECURITY.md`](SECURITY.md). Replace with a real monitored mailbox before opening the repo to outside reporters.
- [ ] **Conduct contact** — `conduct@cir.dev` is a placeholder in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Replace with a real address (or the same security mailbox if appropriate) before public launch.

## Phase 2 follow-ups (from second-pass review)

- [x] Move `runtime/` and `compiler/` under `packages/` — done.
- [x] Bump coverage thresholds from 0 once `@cir/schemas` lands.
- [x] Add `actionlint` step to CI.
- [x] Add `scripts/check-license-headers.ts` (Apache-2.0 SPDX) and wire into `validate`.
- [x] JSON-schema lint pass for `capabilities/*.json` and skills/components data files.

## Phase 3+ candidates

- [ ] Widen CI Node matrix from `[22]` to `[22, 24]` once Node 24 hits LTS.
- [x] Add a `commitlint` GitHub Action so PR titles get the same conventional-commit gating as local commits — landed in Phase 3 (`.github/workflows/commitlint.yml`).
- [ ] Decide whether `actionlint` should also run on `dependabot` PRs (currently scoped to `push` + `pull_request`).
- [ ] Tighten coverage thresholds package-by-package as source lands.
- [ ] Sign capabilities/skills artifacts at publish time per [`docs/production-concerns.md`](docs/production-concerns.md) — needs a key-management decision.

## Repo metadata to set after first push

- [x] Replace `cir/cir` placeholders with `fragmatic-io/cir` in `package.json`, `NOTICE`, and `.github/ISSUE_TEMPLATE/config.yml`.
- [ ] Enable branch protection on `main`: require CI green, require PR review, no force-push.
- [ ] Set up a project board / discussions / wiki preferences once the team grows beyond one.
