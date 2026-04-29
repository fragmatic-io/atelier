# CIR Ethos

> **Capabilities and skills are the public artifact.**
> **Intent is the private artifact.**
> **UI is ephemeral output.**

Ten principles. Memorize these. Every architectural decision in CIR derives from them.

---

**1. The interface is not the product.**
The product is the capability set plus the policies around it. The interface is what an agent compiles for one user at one moment. A great interface is the _output_ of a great capability system, not the input to one.

**2. Capability is contract; UI is suggestion.**
Companies own and version their capabilities the way databases own schemas — strictly, with migrations, with backwards-compat windows. UI is more like a render of a query: the same data renders many ways, none of them canonical.

**3. Intent belongs to the user.**
What the user wants — their workflow, their preferred lens, their priorities, their trust thresholds — is theirs alone. It travels with them across apps. Companies can read it (with permission) but cannot own it, sell it, or hold it hostage.

**4. Skills are the bridge.**
A skill is _a capability plus how to use it well_. It is the smallest unit of company knowledge that is safely transferable to an agent. Skills make capabilities intelligible without exposing implementation. Without skills, every agent has to rediscover patterns the company already solved.

**5. Caching is structural, not optional.**
Recomputing UI per interaction is wasteful and slow. The right primitive is a _manifest_ — a cached, versioned, declarative description of what to render. Manifests recompute only on trigger, never on routine use. This is the single most important architectural commitment in the framework.

**6. Triggers, not polling.**
UI updates are event-driven. A capability schema changed. The user's intent shifted. A new component shipped. The user explicitly asked for a different lens. These are explicit signals, not implicit re-renders.

**7. The render runtime is dumb on purpose.**
The client knows how to bind data to components and call actions. It does not "decide what to show." Decisions live in manifests, manifests live in cache, cache invalidates on triggers. This separation is what keeps tokens cheap and rendering instant.

**8. Reversibility is a primitive, not a feature.**
Every interface change is a diff. Every diff has an inverse. The user can roll back any UI mutation in a single step. The system records every transition with provenance.

**9. Agents serve the user, not the company.**
The user's interface agent answers to them. Companies can advertise capabilities, ship skills, recommend defaults — but they cannot push interface mutations the user did not request. The agent is a fiduciary, not a marketing surface.

**10. Tokens are a budget, not a faucet.**
Every architectural choice asks: does this need an LLM call, or can a hash lookup answer it? Compile rarely; render constantly. A well-designed system spends tokens once per user-week, not per user-action.

---

## The one-line thesis

Software ships **capabilities and skills**. Users keep **intent**. Agents emit **UI as ephemeral output** — cached, versioned, recomputed only on trigger.

The first is public, signed by the company, versioned like a database schema. The second is private, durable, owned by the user, portable across apps. The third is disposable — a manifest the runtime renders, never the source of truth. "UI" here means any rendered surface: a web page, a native screen, an inline chat component, a voice prompt, a spatial overlay.

Get this separation right and 90% of software's flexibility problems collapse into one architecture.

## Mantras

```
Compile rarely, render constantly.
Capability is contract; UI is suggestion.
Intent belongs to the user.
Tokens are a budget, not a faucet.
```

For chat / agent / voice surfaces, add:

```
Most turns are "continue" — don't recompile.
Manifest lives outside context, referenced by ID.
Sub-agent permissions are subset, never superset.
Confirmation is per-action, not per-conversation.
Cost is per-user; surface it transparently.
```

The interface is not the product. The capability is. The conversation is the new interface.
