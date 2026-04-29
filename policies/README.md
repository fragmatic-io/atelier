# policies/

**Pure validator functions** that gate every manifest before it's served. The policy engine is the second line of defense against a jailbroken or hallucinating compiler — fully deterministic, no LLM calls, fast enough to run on every compile and every action call.

## Files

- **Format**: TypeScript (`.ts`) — pure functions exported as `export const policyName: Policy = (manifest, ctx) => Result`.
- **Naming**: `{rule}.ts` — e.g. `data-access-within-grant.ts`, `confirmation-required-for-destructive.ts`, `no-pii-in-query-strings.ts`.
- **One policy per file.** Each file co-locates the rule, its eval fixtures, and its failure message.
- Tests live alongside as `{rule}.test.ts`.

## Background

See [`../docs/architecture.md`](../docs/architecture.md) — section "Policy engine" for the full set of baseline policies and the contract: a manifest that fails any policy is rejected, the compiler retries with the failure reason, and persistent failure surfaces as a developer error (the user falls back to the prior known-good manifest).

## Adding a policy

1. Write the predicate as a pure function. **No I/O. No LLM calls. No clock reads** unless the rule fundamentally requires it.
2. Return a structured result: `{ ok: true }` or `{ ok: false, reason, hint }`. The `reason` is fed back to the compiler on retry; the `hint` helps human reviewers.
3. Add fixtures: at least one manifest that passes, one that fails for the obvious reason, one adversarial case.
4. Register the policy in the engine's policy list (order matters — cheap checks first).
5. Emit `policy.rule_changed` on any semantic change so affected manifests recompile.

## Status

Empty in Phase 1; populated starting in **Phase 2** (Phase 2 of the build plan ships 10 baseline policies). Expect the set to grow as new capability domains land.

## Baseline policies (from the architecture doc)

- `data_access_within_grant`
- `confirmation_required_for_destructive`
- `no_pii_in_query_strings`
- `rate_limited_actions_show_state`
- `reversibility_surfaced`
