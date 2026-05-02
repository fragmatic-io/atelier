# Thesis

> **Capabilities and skills are the public artifact.**
> **Intent is the private artifact.**
> **UI is ephemeral output.**

## The one-line thesis

Software ships **capabilities and skills**. Users keep **intent**. Agents emit **UI as ephemeral output** — cached, versioned, recomputed only on trigger.

The first is public, signed by the company, versioned like a database schema. The second is private, durable, owned by the user, portable across apps. The third is disposable — a manifest the runtime renders, never the source of truth. "UI" here means any rendered surface: a web page, a native screen, an inline chat component, a voice prompt, a spatial overlay.

Get this separation right and 90% of software's flexibility problems collapse into one architecture.

## Why this is interesting

The reason Atelier is interesting is not that it's exotic. It's that every piece already exists in some form — MCP for capabilities, skills as a pattern, manifest-style UI in A2UI and Tambo, intent profiles in memory systems, manifests in JSON, caching in Redis, triggers in pub-sub. Atelier is the _integration_. It says: here is the principled way these pieces fit together, and here is why a system built this way is cheaper, safer, and more flexible than the alternatives.

The bet is that **the next decade of software is built on capability surfaces and ephemeral interfaces**, with users (or agents acting for them) composing what they actually need from a stable substrate. The companies that ship this substrate well will be the operating systems of that decade.

The interface is not the product. The capability is.

## What follows

- [`artifacts.md`](artifacts.md) — the three artifacts in detail (Capabilities + Skills, Intent, Render).
- [`architecture.md`](architecture.md) — the services that make the three artifacts cohere in production.
- [`../ETHOS.md`](../ETHOS.md) — the ten principles you can apply when in doubt.
- [`chat/overview.md`](chat/overview.md) — how the same model extends to conversational, agent, and voice surfaces.
