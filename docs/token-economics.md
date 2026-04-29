# Token Economics

Tokens are the operational cost of the system. The architecture is engineered around minimizing them.

For chat / conversational contexts, **context cost dominates compilation cost** — different optimizations apply. See [`chat/token-economics.md`](chat/token-economics.md).

---

## Cost model

Per-call costs (rough, mid-2026 pricing):

| Operation                  | Tokens   | Cost (Sonnet) | Cost (Opus) |
| -------------------------- | -------- | ------------- | ----------- |
| Trigger classification     | 200-500  | $0.001        | $0.005      |
| Skill discovery            | 1k-3k    | $0.005        | $0.025      |
| Diff recompile             | 3k-10k   | $0.02         | $0.10       |
| Cold compile (small route) | 8k-20k   | $0.05         | $0.25       |
| Cold compile (complex app) | 20k-60k  | $0.15         | $0.75       |
| Cross-app workflow compile | 50k-150k | $0.40         | $2.00       |

---

## Per-user economics

A typical user:

| User type                         | Compiles/month | Avg tokens | Cost/month    |
| --------------------------------- | -------------- | ---------- | ------------- |
| Light (consumer)                  | 2-5            | 10k        | $0.05 - $0.25 |
| Medium (prosumer)                 | 10-20          | 15k        | $0.30 - $1.50 |
| Heavy (power user)                | 30-60          | 25k        | $1.50 - $7.50 |
| Tinkerer (constantly customizing) | 100+           | 20k        | $5 - $30      |

This assumes proper caching. Without caching — recompile every render — costs are 100-1000x higher and the system is economically unviable.

---

## Optimization levers (in order of impact)

**1. Cache aggressively.** A 95% cache hit rate vs 70% is a 6x cost difference. Every architectural decision serves the cache hit rate.

**2. Diff mode over full recompile.** Most triggers change a small piece of context. The compiler's prompt should include the prior manifest and ask only for the diff. 70-90% token savings.

**3. Tiered model routing.** Use cheap models for trigger classification, intent slicing, validation. Reserve expensive models for actual compilation. A trigger classifier that routes 80% of triggers to "no recompile needed" pays for itself instantly.

**4. Skill density.** A well-written skill replaces hundreds of tokens of compiler reasoning. Investing in good skills is the highest-leverage token optimization. Ship skills as carefully as you ship APIs.

**5. Component vocabulary.** A rich, well-named component catalog means the compiler describes UI in component names, not in raw structure. "Use a TaskQueue grouped by sender" is 10 tokens; describing the same UI structurally is 500.

**6. Pre-compiled recipes.** For common personas (founder, student, sales), ship a default recipe per persona. New users start with a pre-warm; the system never compiles from cold for them.

**7. Org-level cache.** In B2B, multiple users in the same org often want the same lenses. Cache at the org level for shared manifests, personalize via thin diff overlays.

**8. Edge inference for small triggers.** Trigger classification can run on small open models at the edge. Only escalate to large models when the classifier is uncertain.

**9. Speculative compilation.** When the user does X, the system predicts they'll likely want Y next and pre-compiles in the background. Wasted compute is cheap compared to user-perceived latency.

**10. Token budget per user, exposed.** Power users who customize constantly should see their token usage. Most won't care. Ones who do can self-throttle or upgrade. This is far better than silently capping.

---

## The compiler prompt budget

A well-engineered compiler prompt fits in 8-20k tokens of context, not 100k:

```
SYSTEM (cached, ~3k tokens):
  CIR framework + manifest schema + validation rules

PER-CALL CONTEXT (~5-15k tokens):
  Relevant capabilities (filtered to route): 1-3k
  Relevant skills (filtered to capabilities): 1-3k
  Component catalog (only components that match the route): 1-2k
  User intent slice (scoped): 0.5-2k
  Previous manifest (if diff mode): 1-3k
  Trigger context: 0.5k
  Examples: 1-2k

OUTPUT (~2-5k tokens):
  Manifest JSON + brief explanation
```

If your compiler prompts are growing past 20k regularly, your skills are doing too little reasoning and your prompts are doing too much. Move logic upward.

---

## The escape hatch

Some users will customize aggressively. That's fine — they're the most valuable signal source. Pricing should reflect the asymmetry:

- **Free tier**: pre-compiled recipes only, no custom recompilation
- **Pro tier**: monthly token budget covering typical customization
- **Power tier**: usage-based pricing for heavy customizers
- **Enterprise**: org-level cache + token pool + dedicated compute

This mirrors how cloud infra is sold. Users who consume more pay more, but the median user pays nothing extra because their cache hit rate is near 100%.
