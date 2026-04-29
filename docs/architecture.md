# Technical Architecture

How the three artifacts are produced, stored, validated, served, and acted on in production.

---

## System overview

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │   Render Runtime (web / native / chat / agent / voice)     │  │
│  │   - Manifest fetcher                                       │  │
│  │   - Component registry binding                             │  │
│  │   - Data binding + query execution                         │  │
│  │   - Action dispatcher (confirms, undo, optimistic UI)      │  │
│  │   - Local manifest cache (IndexedDB / native KV / context) │  │
│  └────────────────────────────────────────────────────────────┘  │
│  Render targets: full-app routes, embedded panels, inline        │
│  chat components, voice prompts, agent-to-agent payloads.        │
│  See chat/render-targets.md for chat/agent specifics.            │
└──────────────────────────────────────────────────────────────────┘
                                ↕
┌──────────────────────────────────────────────────────────────────┐
│                        EDGE / CDN                                │
│   - Capability registry (per app, per version, immutable)        │
│   - Skill library (per app, per version)                         │
│   - Component catalog (per app, per version)                     │
│   - .well-known/cir.json (discovery)                             │
└──────────────────────────────────────────────────────────────────┘
                                ↕
┌──────────────────────────────────────────────────────────────────┐
│                    CONTROL PLANE                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ Compiler Service │  │ Manifest Store   │  │ Trigger Bus    │  │
│  │ (LLM-backed)     │  │ (Redis + S3)     │  │ (Event stream) │  │
│  └──────────────────┘  └──────────────────┘  └────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ Policy Engine    │  │ Eval Harness     │  │ Audit Log      │  │
│  │ (Rule eval)      │  │ (Test runner)    │  │ (Immutable)    │  │
│  └──────────────────┘  └──────────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                ↕
┌──────────────────────────────────────────────────────────────────┐
│                    DATA / ACTION PLANE                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ Action Gateway   │  │ App Backend(s)   │  │ Intent Vault   │  │
│  │ (Auth + audit)   │  │ (CRUD + biz)     │  │ (User-owned)   │  │
│  └──────────────────┘  └──────────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

For chat / agent surfaces, five additional services are layered in: Conversation Memory Service, Inline Render Runtime, Turn-level cache, Modal Router, Agent-to-Agent Capability Bus. See [`chat/architecture-additions.md`](chat/architecture-additions.md).

---

## Data flow: the cold path (compile)

A user requests a route the system has never compiled for them, or a trigger has invalidated their existing manifest.

```
1. Client requests /today
2. Runtime checks local manifest cache → MISS
3. Runtime calls Manifest Store with key:
     manifest:{user_id}:{app_id}:/today:{cap_v}:{intent_v}
4. Manifest Store → MISS
5. Manifest Store enqueues compile job
6. Compiler Service:
   a. Fetches capabilities (from edge cache, hit)
   b. Fetches skills (from edge cache, hit)
   c. Fetches component catalog (from edge cache, hit)
   d. Fetches user intent slice (from vault, scoped)
   e. Calls LLM with structured prompt
   f. Receives manifest candidate
   g. Validates against policy engine
   h. Runs through eval harness (basic checks)
   i. Stores in Manifest Store with cache key
   j. Logs to audit
7. Manifest returned to runtime
8. Runtime caches locally
9. Runtime binds data via Action Gateway
10. UI renders
```

Time budget: 200ms-3s for cold path. Acceptable because it happens rarely.

---

## Data flow: the hot path (render)

```
1. Client requests /today
2. Runtime checks local cache → HIT
3. Runtime binds data sources to live queries
4. Components render with live data
5. User interacts; runtime calls Action Gateway
6. Action Gateway authenticates + validates against policy
7. Result returned; runtime updates bound data
8. UI re-renders the data, NOT the structure
```

Time budget: <16ms render, <100ms data round-trip. This is the path 99% of interactions take. **Zero LLM calls.**

---

## Service contracts

### Capability Registry (read-only, edge-cached)

```
GET /.well-known/cir.json
  → { capabilities_url, skills_url, components_url, version, signature }

GET /capabilities/{id}@{version}
  → CapabilitySchema (immutable, infinite cache)

GET /capabilities?since={version}
  → list of capabilities updated since version
```

### Skill Library (read-only, edge-cached)

```
GET /skills/{name}@{version}
  → SkillDocument (immutable, infinite cache)

GET /skills/index
  → list of all skills with versions and capability dependencies
```

### Component Catalog (read-only, edge-cached)

```
GET /components/registry@{version}
  → ComponentRegistry (immutable, infinite cache)

GET /components/{name}@{version}/examples
  → list of usage examples for the compiler
```

### Intent Vault (user-owned, scoped access)

```
GET /vault/{user_id}/intent?scope={scope}&grant={grant_token}
  → IntentSlice (filtered to granted scope)

POST /vault/{user_id}/intent (user-only)
  → updates intent, emits trigger
```

### Compiler Service

```
POST /compile
  body: {
    user_id, app_id, route, trigger,
    capability_version, intent_version
  }
  → { manifest_id, manifest, compiled_at, token_cost }
```

### Manifest Store

```
GET /manifest/{key}
  → cached manifest or 404

PUT /manifest/{key}
  body: Manifest
  → { stored: true, ttl, invalidates_on }

DELETE /manifest?invalidate={trigger}
  → bulk invalidation
```

### Action Gateway

```
POST /action/{capability_id}
  headers: Authorization, X-Manifest-Id
  body: action input
  → { result, side_effects, audit_id }
```

### Trigger Bus (event stream)

```
emit:
  capability.schema_changed { app_id, capability_id, old_v, new_v }
  component.catalog_changed { app_id, added, removed, changed }
  skill.version_changed { app_id, skill_id, old_v, new_v }
  intent.profile_changed { user_id, scope, old_v, new_v }
  policy.rule_changed { app_id, rule_id }
  user.explicit_recompile { user_id, manifest_id }

subscribe:
  Manifest Store → invalidates affected manifests
  Compiler Service → may pre-warm hot manifests
  Audit Log → records every event
```

---

## Compiler service in detail

The compiler is the only LLM-touching component in the hot system. Its job is to translate `(capabilities + skills + components + intent + trigger)` into a valid manifest.

Structure of a compile call:

```
SYSTEM PROMPT (cached, versioned per compiler release):
  - CIR framework explanation
  - Manifest JSON schema
  - Validation rules
  - Output format requirements

CONTEXT (assembled per call):
  - Relevant capabilities (filtered by route + intent)
  - Relevant skills (filtered by capability set)
  - Component catalog (full, but small)
  - User intent slice (scoped)
  - Trigger reason
  - Previous manifest (if recompiling)

OUTPUT:
  - Manifest JSON
  - Brief diff explanation (for audit)
  - Confidence score
```

The compiler runs a **diff mode** when possible: given the previous manifest and the trigger, produce only the changes. This saves 80%+ of tokens on most recompiles because most of the structure stays the same.

### Compiler model selection

- **Routine recompiles** (intent tweaks, small adjustments): small/fast model
- **Cold compiles** (new user, new app, new route): large model
- **Cross-app workflow compilation**: large model with extended context
- **Trigger-classification only** (does this trigger require recompile?): tiny model

Most companies will use 3-5 model tiers depending on workload.

---

## Policy engine

The policy engine validates every manifest before it's served. Policies are pure functions — fast, deterministic, no LLM calls.

```
POLICY: data_access_within_grant
  for each data source in manifest:
    assert source.fields ⊆ user.granted_fields(app_id)

POLICY: confirmation_required_for_destructive
  for each action in manifest:
    if action.side_effects contains "destructive":
      assert manifest binds it through ConfirmDialog

POLICY: no_pii_in_query_strings
  for each route in manifest:
    assert route.path does not contain user PII fields

POLICY: rate_limited_actions_show_state
  for each rate-limited action:
    assert manifest exposes remaining quota to user

POLICY: reversibility_surfaced
  for each non-trivial mutation:
    assert manifest surfaces an undo affordance
```

A manifest that fails any policy is rejected. The compiler retries with the failure reason, up to N times. Persistent failure surfaces as an error to the developer, not the user (the user falls back to a known-good prior manifest).

---

## Audit log

Every state transition is recorded:

```
{
  "event_id": "evt_...",
  "timestamp": "...",
  "user_id": "...",
  "app_id": "...",
  "type": "manifest.compiled" | "manifest.served" | "action.executed" |
          "intent.changed" | "capability.changed" | ...,
  "actor": "user" | "agent" | "system",
  "before_state_hash": "...",
  "after_state_hash": "...",
  "trigger_chain": ["..."],
  "token_cost": 0,
  "policy_evaluations": [...],
  "manifest_id": "..."
}
```

This is what makes the system **debuggable, reversible, and auditable**. Without it you have a magic box; with it you have an engineering system.
