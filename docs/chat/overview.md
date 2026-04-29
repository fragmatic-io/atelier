# Why This Addendum Exists

The core CIR framework is render-target-agnostic in principle, but its examples assume web/native clients, route-based navigation, and a human user with persistent identity. Chat and agent contexts differ in five ways that matter for production:

1. **Render surface is a conversation, not a route.** UI is rendered inline in messages, not on persistent pages. Layout primitives are different.

2. **The user might be an agent.** When an autonomous agent calls capabilities for itself, "intent" is the agent's task, not a human's preference profile.

3. **Conversation is itself state.** The conversation history is part of the cache, the trigger source, the intent signal, and the audit log — all at once.

4. **Triggers are turn-based, not invalidation-based.** Every user message is a potential trigger. Every tool call result is a potential trigger.

5. **Token economics are dominated by context, not compilation.** A long conversation can spend more tokens on context than the entire CIR compilation pipeline. Different optimization strategies apply.

This document and its sibling chapters address each of these explicitly.

---

## What it does not change

The three artifacts. The ten principles. The trigger → invalidation discipline. The audit log. The policy engine. Every commitment in [`../../ETHOS.md`](../../ETHOS.md) carries through unchanged.

What changes is _how_ those commitments are realized when the surface is a conversation rather than a route, and when the actor may be an agent rather than a human.
