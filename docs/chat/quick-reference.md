# Quick Reference (Chat / Agent / Voice)

For the core framework quick reference, see [`../quick-reference.md`](../quick-reference.md).

```
RENDER TARGETS
  full-app web | native | embedded chat | inline chat | voice
  + future: AR/spatial

AGENT ROLES
  runtime (the chat client)
  on-behalf (acting for a human)
  autonomous (no human in loop)

CIR ⊃ MCP
  Capability ⊃ MCP tool
  Skill = MCP's missing layer
  Component = MCP Apps UI resource (with catalog + composition)
  Manifest = the cacheable artifact

CONVERSATION ARTIFACTS
  session manifest (per conversation)
  persistent manifest (across conversations)
  turn delta (incremental update per turn)
  conversation overlay (intent slice for this conversation)
  thread manifest (chain of manifests in a conversation)

NEW TRIGGERS
  turn.classified (every user message)
  tool.result_changed_data_shape
  topic.shifted
  context.threshold_reached
  subagent.result_emitted
  schedule.fired

NEW SERVICES
  Conversation Memory Service
  Inline Render Runtime
  Turn-level cache
  Modal Router
  Agent-to-Agent Capability Bus

KEY ECONOMICS
  Context cost dominates compilation cost
  Manifest = context compression
  Skills = cached system prompts (Anthropic prompt cache)
  Per-conversation budget visible to user
  Long conversations need compaction strategy

MANTRAS
  Most turns are "continue" — don't recompile.
  Manifest lives outside context, referenced by ID.
  Sub-agent permissions are subset, never superset.
  Confirmation is per-action, not per-conversation.
  Cost is per-user; surface it transparently.
```
