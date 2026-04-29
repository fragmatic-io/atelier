# Quick Reference

```
PUBLIC ARTIFACTS (company)
  /capabilities/  — typed actions + data
  /skills/        — usage knowledge
  /components/    — UI primitives
  /policies/      — safety rules
  /recipes/       — default lenses

PRIVATE ARTIFACT (user)
  /vault/intent/  — preferences, lenses, rules

EPHEMERAL OUTPUT (cached)
  /manifests/     — compiled UI descriptions
  /audit/         — every state transition

CRITICAL SERVICES
  Compiler        — turns inputs into manifests (LLM)
  Policy Engine   — validates manifests (deterministic)
  Manifest Store  — caches manifests (Redis + S3)
  Trigger Bus     — invalidates caches (event stream)
  Action Gateway  — auth + audit for all actions
  Render Runtime  — client SDK that binds manifests to UI

CACHE TIERS
  T5: Browser memory
  T4: Browser persistent
  T3: Manifest Store (server)
  T2: Edge (capabilities/skills/components)
  T1: Origin (source)

TRIGGERS (the only way caches invalidate)
  capability.* | component.* | skill.* | policy.*
  intent.*
  user.recompile | user.revert | user.try_lens
  behavior.workaround_detected (optional)
  system.compiler_upgraded (rare)

MANTRAS
  Compile rarely, render constantly.
  Capability is contract; UI is suggestion.
  Intent belongs to the user.
  Tokens are a budget, not a faucet.
```

For the chat / agent / voice quick reference, see [`chat/quick-reference.md`](chat/quick-reference.md).
