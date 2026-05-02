# Triggers in Chat and Agent Contexts

The core Atelier document defines schema, intent, behavioral, explicit, and system triggers (see [`../triggers.md`](../triggers.md)). Chat and agent contexts add five more.

---

## Turn-level triggers (the dominant new trigger)

Every user message in a conversation is a potential trigger. The runtime classifies each turn:

```
TURN CLASSIFIER (small model, runs in <100ms):

Input: new user message + conversation history + current manifest
Output: one of
  - continue: no recompile needed, agent responds within current manifest
  - extend: small delta needed (add a route, surface a new component)
  - modify: meaningful change needed (different layout, new query)
  - replace: full recompile (intent shifted entirely)
  - clarify: ambiguous, ask the user
```

**80% of turns are `continue`. 15% are `extend`.** The remaining 5% require larger compilations. The classifier saves 90%+ of token cost vs always recompiling.

This is the chat equivalent of cache-hit-rate for web Atelier. It is the single most important token optimization in chat-Atelier. A small fast model classifies every turn before any expensive recompile; 80% continue means 80% of turns cost effectively zero in compilation.

---

## Tool call triggers

When the agent calls a capability and gets a result, the result may invalidate the current manifest:

```
Agent calls flight.search → returns 47 options
  → trigger: data_volume_changed
  → recompile manifest to use a paginated table instead of a card grid
```

Tool result triggers are fast (no LLM in the loop) — they're rule-based: data shape changed, error returned, rate limit hit.

---

## Topic shift triggers

When the conversation pivots to a new topic, the current manifest may no longer apply:

```
Turn 1-5: User is planning a trip → travel manifest active
Turn 6: User says "actually, I need to send this email first"
  → trigger: topic_shift detected
  → save travel manifest to thread, compile email manifest
  → user can return to travel manifest later via "continue planning my trip"
```

Topic shifts are detected by the turn classifier or by an explicit user signal ("let's switch gears").

---

## Context window threshold triggers

When the conversation context approaches the host's window limit:

```
Context approaching 80% of window
  → trigger: context_compaction_needed
  → summarize older turns
  → re-anchor manifest to summary + current turn
  → drop verbose intermediate state
```

This is critical for long conversations. Without it, the system either truncates context unsafely or refuses to continue. With it, conversations can run indefinitely with graceful degradation of older detail.

---

## Sub-agent emit triggers

When a sub-agent finishes its work and returns to the parent agent:

```
Travel sub-agent returns flight options
  → emit: sub_agent_result { agent_id, result, manifest_fragment }
  → parent compiler: incorporate fragment into parent manifest
  → render unified view to user
```

This is how multi-agent compositions stay coherent.

---

## Schedule / cron triggers (background agents)

For autonomous agents:

```
Schedule: "Every weekday 9am, check overnight email and brief me"
  → trigger fires at 9am
  → agent executes capabilities (read inbox, classify, summarize)
  → produces manifest: morning brief
  → delivers via configured channel (push, email, chat-on-open)
```

Background agents have their own manifest cache (per agent, per task) and audit log (separate from interactive sessions but cross-referenced).
