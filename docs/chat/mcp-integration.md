# MCP Integration: CIR ⊃ MCP

CIR maps cleanly onto the [Model Context Protocol](https://modelcontextprotocol.io). If you already speak MCP, you already speak most of CIR.

---

## The mapping

| MCP concept          | CIR concept                       | What CIR adds                                                                              |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| Tool                 | Capability                        | Stricter typing, side-effect declarations, reversibility, confirmation policy, rate limits |
| Tool description     | Skill (partial)                   | Skills are richer: when-to-use, when-not-to-use, failure modes, examples                   |
| Prompt               | Skill (partial)                   | Prompts can be skill primitives                                                            |
| Resource             | Capability of kind `data`         | Same idea, typed schema                                                                    |
| MCP Apps UI resource | Component (rendered via manifest) | CIR adds a component catalog with composition rules                                        |
| Sampling             | Compiler service                  | CIR formalizes this as a typed, cached compile step                                        |

---

## The missing layers MCP doesn't specify

MCP gives you tools and resources. It does not give you:

1. **Skills as a first-class artifact** with usage knowledge separate from tool description
2. **A component catalog** with composition rules and design tokens
3. **An intent vault** for the user's persistent preferences across conversations
4. **A manifest format** as a cacheable, versioned artifact
5. **A trigger system** for managing cache invalidation across versions
6. **A policy engine** that validates UI before rendering

CIR provides all six. You can think of CIR as "MCP plus the production layer."

---

## Migration path: from raw MCP to CIR

If you already have an MCP server, the migration is incremental:

1. **Step 1: keep your MCP tools.** They become your capabilities. Add side-effect declarations and confirmation policies as metadata.
2. **Step 2: write skills.** For each tool or tool group, write a `skill.md` that explains when to use, when not to, common failure modes, and example flows.
3. **Step 3: catalog your components.** If you ship MCP Apps UI, list each component with its props schema, allowed data sources, and allowed actions.
4. **Step 4: stand up a manifest cache.** Even a simple Redis cache keyed by `(user_id, conversation_id, intent_hash)` will eliminate most repeat compilations.
5. **Step 5: introduce policies.** Start with two: confirmation-required-for-destructive and data-scope-within-grant. Add more as you find failure modes.
6. **Step 6: emit triggers.** When a tool's schema changes, when a new component is added, when policy changes — emit an event. Invalidate matching manifests.

A team can do steps 1-2 in a week. Steps 3-6 take a few months but each adds standalone value before the next.

---

## MCP Apps as a CIR render target

When your MCP server returns an MCP Apps UI resource (HTML in a sandboxed iframe), you are rendering a **CIR manifest with `render_target: inline_chat`**. The HTML you generate is the runtime executing the manifest.

The pragmatic recommendation: don't generate HTML directly. Generate a manifest, and use a small client-side runtime (a script bundle in the iframe) that interprets the manifest. This gives you:

- **Cacheability** (the runtime is constant per app version, only the manifest varies)
- **Validation** (the manifest passes through your policy engine before reaching the iframe)
- **Consistency** (all your MCP Apps UIs share components, design tokens, accessibility)
- **Token efficiency** (manifests are 10-100x smaller than equivalent HTML)

The runtime bundle itself is described in [`architecture-additions.md`](architecture-additions.md) under "Inline Render Runtime."
