# Caching

This is the heart of the framework. The single most important decision in CIR is what to cache, where, and how to invalidate it.

---

## Five-tier cache

```
TIER 5: Browser memory                  (per session, milliseconds)
        Hydrated component instances
        Live data subscriptions

TIER 4: Browser persistent              (per device, days-weeks)
        IndexedDB / native KV
        Manifests for routes the user visits

TIER 3: Manifest Store                  (per user, weeks-months)
        Server-side compiled manifests
        Indexed by (user, app, route, cap_v, intent_v)

TIER 2: Edge / CDN                      (per app, immutable per version)
        Capabilities, skills, components
        Signed by app, infinite TTL per version

TIER 1: Origin                          (per app, source of truth)
        Capability source files
        Skill source files
        Component implementations
```

Higher tiers are faster but more volatile. Lower tiers are slower but more authoritative. Reads cascade upward (check 5, then 4, then 3, then 2, then 1). Writes invalidate downward via the trigger bus.

---

## Cache keys

Manifest cache key:

```
manifest:{user_id}:{app_id}:{route}
  :cap_{capability_registry_version}
  :cmp_{component_catalog_version}
  :skl_{skill_set_hash}
  :int_{intent_profile_version}
  :pol_{policy_set_version}
```

The key is structured so any single change to any input artifact produces a different key. Old manifests stay valid for users still on old artifact versions; new manifests are computed only for combinations that actually need them.

Edge cache keys (immutable):

```
capability:{app_id}:{capability_id}@{version}
skill:{app_id}:{skill_id}@{version}
component_catalog:{app_id}@{version}
```

Signed and immutable. Once published, never changes. New versions get new keys.

---

## What invalidates what

This is the trigger → invalidation matrix. Memorize it.

| Trigger                      | Invalidates                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| Capability schema changed    | All manifests using `cap_<old_version>` for that app           |
| Capability removed           | All manifests referencing the capability — fail loudly         |
| Component added              | Nothing (additive, manifests can opt in on next compile)       |
| Component deprecated         | Manifests using that component, after deprecation grace        |
| Component removed            | All manifests using that component — fail loudly               |
| Skill content changed        | Manifests compiled with affected skill (semantic invalidation) |
| Skill version bumped         | Same as above                                                  |
| Policy added/strengthened    | All manifests for that app — re-validate, recompile if invalid |
| Policy relaxed               | Nothing (existing manifests still valid)                       |
| Intent profile slice changed | Manifests dependent on that slice                              |
| User explicit recompile      | The specific manifest                                          |
| User reverts manifest        | None — serves prior cached manifest                            |

For chat / conversational contexts, additional triggers apply (turn classification, tool result, topic shift, context threshold). See [`chat/triggers.md`](chat/triggers.md).

---

## Semantic invalidation (the subtle one)

When a skill or capability _description_ changes but the schema doesn't, the manifest may still be functionally correct but semantically stale. The user's intent ("classify emails") might now have a better implementation available.

Strategy: **soft invalidation**. The manifest is marked stale but still served. On next user-facing trigger (route navigation, app open), the system asynchronously recompiles in the background and swaps the manifest in. The user never waits.

---

## What you NEVER cache

- The raw data being rendered. Data goes through the Action Gateway with normal HTTP cache rules. The manifest declares _how_ to fetch it; the cache stores the _manifest_, not the data.
- The user's intent vault contents. Always fetched fresh per compile (cheap because vault is fast, scoped, and small).
- Action results. Mutations are not idempotent in general; never cache them.
- LLM compiler outputs unkeyed by full input set. A manifest is only valid for the exact input combination it was compiled from.

---

## Cache warming

For known popular paths:

- New user signs up → pre-compile default recipe manifests (founder, student, recruiter, etc.) and let the user pick a starting lens
- Capability version bump → background-recompile the top 1% most-used manifests immediately, lazy-recompile the rest
- Intent change to a popular slice → recompile only routes that depend on that slice

Cache warming is optional — the system works without it — but it dramatically improves perceived performance for hot paths.

---

## Local cache strategy

The browser/native runtime maintains its own cache:

```
IndexedDB schema:
  manifests: { key, manifest, fetched_at, last_used, etag }
  invalidation_log: { trigger_id, applied_at }
  pending_actions: { id, capability, input, optimistic_state }

Eviction policy: LRU, 50MB soft cap, 200MB hard cap
Sync policy:
  - On app open: long-poll trigger bus for invalidations since last sync
  - On route change: check local first, fallback to server
  - On focus: revalidate stale manifests in background
```

This is what makes CIR feel instant on subsequent visits. The first compile takes seconds; every subsequent render is sub-frame.
