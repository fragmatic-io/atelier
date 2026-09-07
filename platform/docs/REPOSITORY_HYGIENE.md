# Repository hygiene audit

Audit date: 2026-09-07. Git cutoff: files whose latest commit was before 2026-09-04.

The repository contained 409 tracked files at the audit commit. Only the six files below were older than the cutoff. Each was inspected against the current npm-based V2.3 repository, workflows, package manifest and supported runtime paths.

| File | Disposition | Current reason |
| --- | --- | --- |
| `.editorconfig` | Keep | Enforces the whitespace, LF, UTF-8 and Makefile-tab rules used by current source and tests. |
| `.gitattributes` | Rework | LF and binary rules remain valid. Removed references to the retired pnpm lock and schema-generator paths; added current `package-lock.json` and generated package-manifest rules. |
| `.github/actionlint.yaml` | Rework | Still consumed by the active actionlint workflow. Replaced the obsolete phase comment with current GitHub-hosted-runner wording. |
| `.github/workflows/actionlint.yml` | Keep | Actively validates GitHub workflow YAML on `main` pushes and pull requests with read-only repository permission. |
| `CODE_OF_CONDUCT.md` | Keep | Current contributor-governance and private reporting policy for the public repository. |
| `LICENSE` | Keep | Current MIT grant required by the root distribution and SPDX headers. |

No old runtime source, test, compatibility shim or product documentation survived this cutoff review. Superseded application/framework trees and duplicate V2.3 harnesses were already removed and are enforced by `platform/tests/repository-hygiene.test.mjs`. Age alone was not treated as evidence that a governance file was dead.

Run the canonical check after future cleanup changes:

```sh
cd platform
ATELIER_PYTHON="$PWD/.venv/bin/python" npm run acceptance
```
