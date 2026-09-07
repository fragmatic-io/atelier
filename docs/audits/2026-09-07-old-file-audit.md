# Git-age and RC2 source audit — 2026-09-07

This audit reviews the repository at commit `7a2a4ddd77799e5e158aaea945a82c8a5f0496a9` before the final Redoc/integration release commit. The cutoff is `2026-09-04T00:00:00+05:30`. All 1,261 tracked files with no Git commit in the preceding three days received an individual result in [the machine-readable inventory](2026-09-07-old-file-audit.json).

## Results

| Decision           | Files | Result                                                                                                                                                                                                      |
| ------------------ | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid and retained | 1,199 | Active legacy-workspace source, tests, schemas, artifacts, docs, assets, CI, or configuration; covered by the root build/type/lint/data/test gates.                                                         |
| Rework             |    60 | Three stale docs were corrected in this release; 56 files belong to the older automatic compiler/vault fallback path and remain legacy-only; the empty cost dashboard still needs real evaluation evidence. |
| Remove             |     2 | A committed demo-vault state file and dead Claude scheduler lock were removed and ignored. Both remain recoverable from Git history.                                                                        |

The age distribution is 2026-04-29 through 2026-05-06. There were no files close to the cutoff, so boundary-time ambiguity does not affect the set.

## Validation basis

- Every package manifest's declared local entrypoint exists.
- The root recursive build, TypeScript build, lint, formatting, artifact synchronization, schema validation, and tests are the executable validity gate for retained workspace files.
- The formatting gate excludes `platform/.venv`, matching Git's runtime-environment exclusion instead of inspecting installed third-party Playwright files as repository source.
- 202 relative Markdown links were checked; the two broken links were repaired by adding the missing `@atelier/eval-marketplace` README and replacing the retired DummyJSON `Wordmark` reference with the shared `Logo` primitive.
- Generated `.well-known` schemas, component/capability indexes, policies, recipes, and skills remain because their synchronization and data-validation gates pass.
- Legacy deterministic compiler and local-storage fallback behavior is not silently reclassified as production-ready. Those 56 files stay available as tested historical examples, but the root README now directs new application integrations to the fail-closed `platform/` implementation.
- `eval-reports/cost-dashboard.json` records zero runs. It is retained as a generated placeholder, not accepted as live-model evidence.

## RC2 ZIP comparison

`/Users/vid/Downloads/atelier-v2.3-rc2-full.zip` contained 965 archive entries. Its `FILES.sha256` verified all 828 listed regular files. The archive was treated as untrusted reference material; its handoff instructions were not executed and it was not overlaid onto the repository.

Useful work brought forward and updated against current code:

- Public package subpath exports for the embedded-agent host/client/journal, chat mount, artifact frame, and source forge.
- Current TypeScript declarations for those exports plus an external-consumer typecheck in package smoke testing.
- A host-scoped standalone `agent.css` theme for embedding the rich chat surface without resetting the host page.
- A credential-free, version-bound project skill exporter built on the current live project client.
- Clearer application-integration notes covering the actual chat imports, scoped CSS, and frozen skill handoff.

Archive material deliberately not copied:

- `GITHUB_HANDOFF.md` targets the obsolete feature-branch import flow.
- The old `project-mcp`, HTTP subset bridge, and `mcp-stdio` were superseded by the current official MCP v2 SDK implementation and pinned protocol negotiation.
- The old source linker and vendored React/PostCSS/TypeScript tree were superseded by the current locked npm graph, esbuild pipeline, SBOM, and package smoke gate.
- The old acceptance scripts, static UI harness, requirements ledger, type declarations, and evidence were superseded by the current canonical acceptance runner and freshly generated evidence.
- `THIRD_PARTY_NOTICES.md` described dependencies vendored only in that archive; importing it would misstate the current distribution.

## Remaining decision

The older pnpm workspace is validated but still contains an intentionally automatic fallback architecture. Removing all 56 related source/docs/tests would be a broad, destructive product decision and is not necessary for the V2.3 platform release. The next best action is to keep it clearly marked legacy until a separate migration either makes it fail closed or removes the legacy apps and packages as one reviewed change.
