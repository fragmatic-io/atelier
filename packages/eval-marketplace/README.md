# @atelier/eval-marketplace

Evaluation and cost-accounting helpers for testing Atelier marketplace recipes against deterministic fixtures or an explicitly configured live compiler.

## Public surface

- `runMarketplaceEval()` executes the selected fixture or live-model evaluation mode and returns a structured report.
- `summariseLastNRuns()` builds per-persona cost, latency, pass-rate, and trend summaries from saved reports.
- Pricing helpers calculate recorded token cost against the package's pinned pricing revision.
- Local-fixture helpers load unsigned development recipes without presenting them as verified marketplace artifacts.

The package does not silently replace a requested live compiler. Callers must select the evaluation mode, provide the required credentials, and preserve failed or unavailable provider results as failures.

## Development

```sh
pnpm --filter @atelier/eval-marketplace build
pnpm --filter @atelier/eval-marketplace typecheck
pnpm --filter @atelier/eval-marketplace test
```

Repository-level packaging is verified by `pnpm smoke-test:pack`. The scheduled cost dashboard consumes reports under `eval-reports/`; an empty report is not live-model evidence.
