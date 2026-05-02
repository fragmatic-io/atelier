# Architecture Additions for Chat / Agent Surfaces

The core Atelier architecture (see [`../architecture.md`](../architecture.md)) works for chat/agent contexts, but five additional services improve production fit.

---

## 1. Conversation Memory Service

```
Stores per-conversation state:
  - Conversation history (full, with PII redaction options)
  - Conversation overlay on intent profile
  - Thread manifest (chain of manifests rendered in this conversation)
  - Token usage per turn
  - Sub-agent invocations and results
  - Compaction history

Provides:
  - GET /conversation/{id}/context?turns=last_N&include=manifests,actions
  - POST /conversation/{id}/compact (triggered by threshold or explicit)
  - GET /conversation/{id}/audit (full audit chain)
  - DELETE /conversation/{id} (user-initiated, with retention policy)
```

This is what makes long conversations economically and technically viable.

---

## 2. Inline Render Runtime

```
A small (typically <50KB) JavaScript bundle that runs inside chat host iframes
(MCP Apps, OpenAI Apps SDK contexts).

Responsibilities:
  - Fetch manifest from Atelier backend (with auth from host)
  - Bind data via host-provided fetch API
  - Render components from local catalog
  - Dispatch actions through host-provided action API
  - Send back action results as conversation messages
  - Sandboxed: no DOM access outside iframe, no localStorage, no network beyond Atelier backend
```

Multiple runtimes can exist (one per app, or a shared one for many apps). Hosts cache them by version + signature.

---

## 3. Turn-level cache

```
Sits in front of the compiler service, specifically for chat contexts.

Cache key: hash(conversation_id + turn_classifier_output + capability_set + intent_overlay)

TTL: lives only for the current conversation; evicted on conversation close

Purpose: avoid recompilation when the same turn-pattern recurs in the same conversation
(e.g., user keeps asking "show me option N", compiler doesn't need to recompile each time)

Hit rate target: 60%+ (conversations have repeated patterns)
```

---

## 4. Modal Router

```
Decides which render target(s) to use for a given response.

Inputs:
  - Available render targets (chat host capabilities, voice availability, etc.)
  - User's modal preferences (intent profile)
  - Manifest's content type (forms render best in chat; quick choices in voice)
  - Urgency (push notifications for time-sensitive)
  - Bandwidth (low-bandwidth prefers text + minimal UI)

Output:
  - render_target spec passed to compiler
  - Optionally: parallel render across multiple targets (text + chat + push)
```

---

## 5. Agent-to-Agent Capability Bus

```
For multi-agent systems. Manages capability negotiation and result routing
between agents.

Provides:
  - capability discovery (what does this agent expose?)
  - capability invocation (with auth, scope check, audit)
  - result routing (back to caller, with audit chain)
  - permission inheritance enforcement
  - timeout / cancellation
  - circuit breakers (if a sub-agent keeps failing, stop calling it)

Compatible with: A2A protocol (Google), AG-UI, custom agent buses
```

This bus is what enforces sub-agent permission inheritance described in [`agent-roles.md`](agent-roles.md).
