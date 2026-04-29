# Conversation-Scoped Artifacts

In chat contexts, manifests have a different lifecycle than in web apps. Three new concepts apply: session manifests, turn deltas, and conversation memory as intent slice. Plus the thread manifest as the audit object.

---

## Session manifests vs persistent manifests

In a web app, a manifest serves a route and is cached until invalidated. In a chat context, manifests come in two flavors:

**Persistent manifests** are scoped to the user, live across conversations, and follow the standard CIR caching rules. Example: the user's preferred way of seeing flight options whenever they ask about flights.

**Session manifests** are scoped to a single conversation, live only as long as the conversation is active, and are discarded when the conversation ends. Example: a multi-step booking wizard for one specific trip.

Session manifests are derived from persistent manifests but specialized to conversation context. The cache key includes the conversation ID:

```
manifest:{user_id}:{app_id}:{conversation_id}:{turn}:{intent_hash}
```

Eviction policy: session manifests expire 24-72 hours after the last turn in the conversation.

---

## Turn deltas

A conversation evolves. Each user turn may invalidate or extend the current manifest. Recompiling from scratch every turn is wasteful — most turns only require a small delta.

The compiler's diff mode is essential here. Given:

- The current manifest
- The new user message
- The conversation history
- The capability/skill set

The compiler produces a **turn delta**:

```json
{
  "delta_type": "extend" | "modify" | "replace",
  "previous_manifest": "m_8f3a",
  "new_manifest": "m_8f3b",
  "changes": [
    { "op": "add_route", "path": "/booking-confirmation", "spec": {...} },
    { "op": "update_data_source", "component_id": "c_001", "filter": "..." }
  ],
  "tokens_used": 2400,
  "model": "claude-sonnet-4-7"
}
```

The runtime applies the delta in place. Most of the previous manifest is reused; only the changed portions re-render.

---

## Conversation memory as intent slice

The conversation history is itself a form of intent. When the user said three turns ago "I prefer afternoon meetings," that's intent the compiler should respect for the rest of the conversation.

The system maintains a **conversation-scoped intent overlay** on top of the persistent intent profile:

```json
{
  "persistent_intent": {
    "user_id": "vid",
    "global_preferences": { ... }
  },
  "conversation_overlay": {
    "conversation_id": "conv_abc",
    "overrides": [
      { "scope": "scheduling", "rule": "afternoons only this week", "set_at_turn": 3 },
      { "scope": "*", "rule": "respond concisely", "set_at_turn": 1 }
    ],
    "context_summary": "User is planning a Tokyo trip; wants minimal options, prefers concise responses"
  }
}
```

The compiler reads both. The persistent intent provides defaults; the overlay provides conversation-specific overrides. Overlays do not write back to the vault unless the user explicitly says "remember this."

---

## The thread manifest

A long conversation often produces multiple manifests across turns. The system tracks these as a **thread manifest**:

```json
{
  "conversation_id": "conv_abc",
  "thread": [
    { "turn": 1, "manifest_id": "m_001", "rendered_components": ["TravelOptions"] },
    { "turn": 3, "manifest_id": "m_002", "rendered_components": ["FlightDetail"] },
    { "turn": 5, "manifest_id": "m_003", "rendered_components": ["BookingForm"] },
    { "turn": 7, "manifest_id": "m_004", "rendered_components": ["BookingConfirmation"] }
  ],
  "total_tokens": 18400,
  "total_actions_executed": 3
}
```

The thread manifest is the audit object for the conversation. It's what you'd hand a security review or a billing system.

---

## Context window as cache budget

The chat host has a finite context window. Everything in it costs tokens on every turn. A naive system shoves the full manifest into context every turn — this is wasteful at best, breaks at worst.

The right pattern: **the manifest lives outside the context window**, the conversation references it by ID. The host runtime fetches the manifest as needed; the agent's context only contains:

- The conversation history (summarized as it grows)
- The current manifest's _summary_ (component types and key bindings, not full schema)
- Capability descriptions for tools the agent might call this turn (filtered by current intent)
- Skill descriptions for the active task

This typically keeps per-turn context under 10K tokens even for long conversations, vs 50K+ if you stuff everything in. See [`token-economics.md`](token-economics.md) for the full cost model.
