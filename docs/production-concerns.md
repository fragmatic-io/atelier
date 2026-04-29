# Production Concerns

Security, observability, evals, versioning, compliance. The things you must instrument before serving real users.

For chat / agent surfaces, additional concerns apply (context isolation, multi-tenant safety, prompt injection through history, conversation-scoped audit). See [`chat/production-concerns.md`](chat/production-concerns.md).

---

## Security

The threat model:

### Threat: Prompt injection in capability descriptions, skill content, or user data causes the compiler to emit a malicious manifest.

**Mitigation:**

- Capabilities and skills are signed by the app at publish time; signature verified on load
- User data is treated as untrusted in the compiler prompt (sandboxed sections)
- Policy engine validates every output before serving
- Manifests are sandboxed: actions only execute through the Action Gateway with full auth

### Threat: Manifest references a capability the user does not have permission to call.

**Mitigation:**

- Action Gateway re-authorizes every action call against the user's grants
- A manifest cannot widen permissions — only the user can grant
- Policy engine rejects manifests that reference ungranted capabilities

### Threat: User's intent vault is leaked or corrupted.

**Mitigation:**

- Vault is encrypted at rest with user-derived key
- Apps receive scoped, time-limited tokens to read slices, never write
- Vault writes are signed by the user (or their authenticated agent)
- Audit log of all vault access

### Threat: Compiler is jailbroken, emits an unsafe manifest.

**Mitigation:**

- Policy engine is the second line of defense, fully deterministic
- Eval harness runs every new manifest against safety tests
- Manifests are versioned; rollback is instant
- Suspicious manifests trigger human review before serving

### Threat: Component implementation has a vulnerability (XSS, etc.).

**Mitigation:**

- Components are vetted, versioned, reviewed
- Runtime sanitizes all data before passing to components
- CSP and iframe sandboxing for any third-party-rendered content

---

## Observability

What every CIR deployment must instrument:

```
Metrics:
  - manifest_compile_count by (app, route, trigger)
  - manifest_compile_latency_ms (p50, p95, p99)
  - manifest_cache_hit_rate by (tier, app, route)
  - token_cost_per_compile (by model)
  - policy_violation_count by (policy, app)
  - eval_failure_count by (eval, app)
  - action_latency_ms by (capability)
  - user_revert_count by (app, route)
  - behavioral_trigger_acceptance_rate

Traces:
  - Full trigger → invalidation → recompile → policy check → serve
  - Action call → auth → execute → audit

Logs:
  - Compiler input/output (sampled, PII-scrubbed)
  - Policy evaluations
  - Audit log (never sampled)
```

The audit log is the canonical record. Everything else is for performance tuning. A CIR system without an audit log is unsafe to run in production.

---

## Evals

Every artifact has tests.

**Capability evals**: input validation, side effect expectations, permission enforcement.

**Skill evals**: given an input scenario, does the skill produce the expected sequence of capability calls?

**Component evals**: rendering tests across breakpoints, a11y tests, interaction tests.

**Manifest evals**: given a representative intent and capability set, does the compiler produce a manifest that:

- passes all policies
- exposes the expected functionality
- doesn't expose forbidden data
- is reachable in the expected number of clicks
- matches the user's stated lens preference

**End-to-end evals**: representative user flows from intent → manifest → render → action → audit.

The eval suite runs on:

- Every capability change
- Every component change
- Every skill change
- Every compiler model upgrade
- Daily on production samples

A CIR system with weak evals will produce weird interfaces and erode trust. A CIR system with strong evals can iterate fast on the compiler without breaking users.

---

## Versioning and migration

Capabilities and components follow semver:

- Patch: bug fix, no schema change
- Minor: additive change (new optional field, new capability)
- Major: breaking change (removed field, changed semantics)

Major version bumps trigger a migration window:

- Old version remains served for 90 days (configurable)
- Compiler prefers new version for fresh manifests
- Existing manifests pinned to old version continue to work
- Migration guide published; tooling assists adapter rewrite

Components that are removed must be deprecated with a clear replacement and a 90-day window. The compiler can be instructed to prefer the replacement during the window.

The intent vault is versioned per-user. Users can roll back their own intent profile changes. Apps cannot revert user intent.

---

## Compliance

For regulated industries:

- All actions logged with cryptographic provenance
- Manifests are reviewable artifacts — auditors see exactly what was rendered to whom
- Policy engine enforces compliance rules (e.g., HIPAA data scopes) at compile time
- Intent profiles can be exported and audited
- Data residency: vault, manifest store, and audit log can be regionally pinned
