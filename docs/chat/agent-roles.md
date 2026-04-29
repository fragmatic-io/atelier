# The Agent's Three Roles

In CIR, an agent can occupy any of three roles. Each role has different intent semantics, audit requirements, and trust boundaries.

---

## Role 1: Agent-as-runtime (the chat client itself)

The agent is the _thing_ rendering manifests. Claude.ai and ChatGPT are agents-as-runtimes when they render MCP Apps inline.

- **Whose intent compiles the manifest?** The end user's. The chat client may add render-target constraints but does not own intent.
- **Audit**: the chat host logs the manifest and any actions invoked.
- **Permission model**: the chat host enforces sandboxing; the user grants per-app capability access.

## Role 2: Agent-on-behalf-of-user

The agent is acting for a human, calling capabilities, getting results, optionally rendering UI for the human's review.

- **Whose intent compiles the manifest?** The user's, scoped to the agent's task. The agent may also have task-level intent ("present this concisely, the user is in a hurry").
- **Audit**: the agent's calls are logged with the user's identity _and_ the agent's identity. Both are accountable.
- **Permission model**: the user grants the agent capability scopes. The agent cannot exceed those scopes regardless of what the user's chat instruction says.

## Role 3: Agent-as-autonomous-actor

The agent is operating without a human in the loop — a background workflow, a scheduled job, a cron-triggered automation.

- **Whose intent compiles the manifest?** The agent's. The "intent profile" is the task definition + the agent's standing instructions.
- **Audit**: every action logged, often to a downstream human review queue.
- **Permission model**: capability scopes pre-approved by a human at deployment time. Any out-of-scope request is rejected, surfaced as an exception.
- **Render target**: usually no UI. Output may be a structured report, a notification, an email, or a manifest that gets delivered to a human's inbox for review.

---

## Multi-agent compositions

When agents call agents, intent flows down and audit flows up:

```
Human user
  ↓ (intent: "research and book my trip to Tokyo")
User's primary agent
  ↓ (sub-intent: "find flights matching constraints")
Travel sub-agent (calls flight capabilities)
  ↑ (results: flight options manifest)
User's primary agent
  ↓ (sub-intent: "find lodging matching constraints")
Lodging sub-agent (calls hotel capabilities)
  ↑ (results: lodging manifest)
User's primary agent
  → (composed manifest: trip review with options)
Human user
```

CIR handles this with **sub-agent permission inheritance**: a sub-agent inherits a strict subset of its parent's capability grants, and the parent records every sub-agent invocation in its own audit chain. The user's audit log shows the full tree.

The bus that mediates these interactions is described in [`architecture-additions.md`](architecture-additions.md) (Agent-to-Agent Capability Bus).
