# CIR for Chat Interfaces and Agents

Companion to the core CIR framework. Extends the model to:

- **AI chat interfaces** — Claude.ai, ChatGPT, custom chatbots, embedded chat panels
- **Autonomous agents** — no human in the loop
- **Multi-agent systems** — agents calling agents
- **Voice and multi-modal surfaces** — beyond text

The core framework is render-target-agnostic. The chapters here specify _how_ CIR applies when the render target is a conversation, when the user is an agent, or when the runtime is a chat client.

---

## Reading order

1. [overview.md](overview.md) — why this addendum exists; the five differences from the core framework
2. [render-targets.md](render-targets.md) — the five render targets (full-app, native, embedded chat, inline chat, voice)
3. [agent-roles.md](agent-roles.md) — runtime, on-behalf, autonomous; multi-agent compositions
4. [mcp-integration.md](mcp-integration.md) — CIR ⊃ MCP, the mapping, migration path
5. [conversation-artifacts.md](conversation-artifacts.md) — session manifests, turn deltas, conversation overlays, thread manifests
6. [multi-modal.md](multi-modal.md) — text fallback, inline UI, voice scripts, mixed-modal, image input, AR
7. [triggers.md](triggers.md) — turn-level, tool result, topic shift, context threshold, sub-agent emit, schedule
8. [token-economics.md](token-economics.md) — context cost dominates; manifest as compression
9. [runtime-instructions.md](runtime-instructions.md) — **AGENTS.md for runtime agents** (drop into agent system prompt)
10. [architecture-additions.md](architecture-additions.md) — five new services on top of the core
11. [implementation-patterns.md](implementation-patterns.md) — eight production patterns
12. [production-concerns.md](production-concerns.md) — context isolation, multi-tenant safety, prompt injection through history
13. [deployment-scenarios.md](deployment-scenarios.md) — five concrete starting points
14. [quick-reference.md](quick-reference.md) — the card

---

## Same model, different surfaces

- Capabilities + skills are public (your MCP tools + your skill library)
- Intent is private (the user's persistent profile + the conversation overlay)
- UI is ephemeral output (manifests rendered inline, in voice, across channels)

The implementations differ. The principles don't.

The interface is not the product. The capability is. The conversation is the new interface.
