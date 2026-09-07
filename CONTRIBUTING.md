# Contributing to Atelier

Atelier 2.3 lives entirely in [`platform/`](platform/). Read [`AGENTS.md`](AGENTS.md), the [architecture](platform/docs/ARCHITECTURE.md), and the [threat model](platform/docs/THREAT_MODEL.md) before changing security or runtime behavior.

## Setup

```sh
cd platform
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements-browser.txt
.venv/bin/playwright install chromium
```

Use Node.js 22.16 or newer. Runtime state and secrets must live outside the checkout.

## Before requesting review

- Add or update focused tests for every changed behavior.
- Run `npm run test:unit` and `npm run verify` from `platform/`.
- Run `ATELIER_PYTHON="$PWD/.venv/bin/python" npm run acceptance` on the committed change.
- Update current documentation when setup, security boundaries, or product behavior changes.
- Report external or untested paths explicitly. Do not replace missing providers, browsers, credentials, or independent review with a fallback.
- Keep changes modular and preserve tenant/project isolation, authorization, confirmation, signature, design-review, and privacy gates.

The repository uses Conventional Commit subjects. Do not bypass a failed validation gate; fix it or document the exact external blocker.
