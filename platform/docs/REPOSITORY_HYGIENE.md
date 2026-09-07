# Repository hygiene audit

Audit date: 2026-09-07. Git cutoff: files whose latest commit was before 2026-09-04.

The repository contained 409 tracked files at the audit commit. Only the six files below were older than the cutoff. Each was inspected against the current npm-based V2.3 repository, workflows, package manifest and supported runtime paths.

| File | Disposition | Current reason |
| --- | --- | --- |
| `.editorconfig` | Keep | Enforces the whitespace, LF, UTF-8 and Makefile-tab rules used by current source and tests. |
| `.gitattributes` | Rework | LF and binary rules remain valid. Removed references to the retired pnpm lock and schema-generator paths; added current `package-lock.json` and generated package-manifest rules. |
| `.github/actionlint.yaml` | Remove | Became unused when hosted GitHub Actions were removed. Local acceptance remains the canonical gate. |
| `.github/workflows/actionlint.yml` | Remove | Hosted CI is intentionally absent until it is deliberately rebuilt and enabled. |
| `CODE_OF_CONDUCT.md` | Keep | Current contributor-governance and private reporting policy for the public repository. |
| `LICENSE` | Keep | Current MIT grant required by the root distribution and SPDX headers. |

The newer GitHub acceptance workflow and Dependabot configuration were also removed at the operator's direction because Actions are disabled and Dependabot would recreate non-main branches. The pull-request template remains because it is not executable automation.

No old runtime source, test, compatibility shim or product documentation survived this cutoff review. Superseded application/framework trees, duplicate V2.3 harnesses and retired hosted-automation files are enforced by `platform/tests/repository-hygiene.test.mjs`. Age alone was not treated as evidence that a governance file was dead.

The test cleanup also removed four redundant suites: CLI/demo happy paths duplicated by package and browser acceptance, Studio auth markup duplicated by live HTTP and Chromium coverage, certifier-runner errors duplicated by isolation and the reference matrix, and component-HTTP happy paths duplicated by lifecycle/package/browser gates. Distinct tests for tenant isolation, authorization, privacy, signatures, confirmation, idempotency, providers, source isolation, capability governance, rich surfaces and the actual browser journey remain mandatory.

Run the canonical check after future cleanup changes:

```sh
cd platform
ATELIER_PYTHON="$PWD/.venv/bin/python" npm run acceptance
```
