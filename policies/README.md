# policies/

**Pure validator functions** that gate every manifest before it's served. The policy engine is the second line of defense against a jailbroken or hallucinating compiler — fully deterministic, no LLM calls, fast enough to run on every compile and every action call.

## Two surfaces

CIR has **two** policy surfaces that should not be confused:

1. **`@cir/policies` (TypeScript)** — the runtime validator code. Pure functions, deterministic, fast, runs every compile and every action call. Lives in [`../packages/policies/`](../packages/policies/README.md).
2. **This directory (declarative JSON)** — app-defined policies that ride alongside capabilities, validated against `@cir/schemas`'s `PolicySchema`. The `_review` envelope and `cir-schemas validate-data --strict` gate apply here. Discovery via `/.well-known/cir.json`.

Files in this directory are metadata about how an app's capabilities should be governed (rate limits, confirmation thresholds, scope rules). They are consumed by the runtime alongside the baseline `@cir/policies` validators.

## Files (declarative)

- **Format**: JSON, validated against `PolicySchema` (`@cir/schemas`).
- **Naming**: `{rule}.json` — e.g. `cart-modifications-rate-limited.json`.
- **One policy per file.** The runtime composes these alongside the baseline.

## What ships in this repo

- `cart-modifications-rate-limited.json`
- `no-destructive-issue-actions-without-confirmation.json`

## Background

See [`../docs/architecture.md`](../docs/architecture.md) — section "Policy engine" for the contract: a manifest that fails any policy is rejected, the compiler retries with the failure reason, and persistent failure surfaces as a developer error (the user falls back to the prior known-good manifest).

## Baseline policies (shipped in `@cir/policies`)

- `data_access_within_grant`
- `confirmation_required_for_destructive`
- `no_pii_in_query_strings`
- `rate_limited_actions_show_state`
- `reversibility_surfaced`
- `respects_brand_kit`
- `composes_according_to_rules` (factory; bound at runtime to the live composition rules)

See [`../packages/policies/README.md`](../packages/policies/README.md) for the package surface, severities, and usage.
