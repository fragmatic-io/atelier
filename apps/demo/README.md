# @cir/demo — Next.js demo

A working CIR end-to-end stack as a Next.js 15 App Router app. Boots offline. **No LLM API key needed** — the compiler is faked.

## What this proves

A real `Manifest` flows through the runtime and renders as React:

```
ManifestFetcher → ManifestResolver (cache + policy validate) →
buildRenderPlan → @cir/react render walker →
@cir/components + apps/demo/components → DOM
```

User actions go through the dispatcher, get gated by `confirmation: 'modal'`, and call back through the action registry to fake API endpoints.

## Run it

```bash
# from the repo root
pnpm install
pnpm --filter @cir/demo dev
# → http://localhost:3000/today
```

Open the browser DevTools console to see the audit events the `ConsoleAuditSink` emits (`manifest.served`, `action.executed`, `action.denied`).

## What's wired

| Layer               | Where                                                           | What it does                                                    |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Fake compiler       | `app/api/manifest/[...slug]/route.ts` + `lib/fake-manifests.ts` | Returns a hand-written `Manifest` for `/today`                  |
| Fake data           | `app/api/data/[capability]/route.ts` + `lib/fake-data.ts`       | In-memory threads + tasks                                       |
| Fake actions        | `app/api/action/[capability]/route.ts`                          | Mutates the in-memory store, returns `ActionResult`             |
| Capability metadata | `lib/fake-capabilities.ts`                                      | Side effects, confirmation, reversibility per capability        |
| Provider tree       | `lib/cir-providers.tsx`                                         | Builds services bag, wires data resolver, mounts confirm portal |
| Domain components   | `components/{DecisionQueue,TaskQueue}.tsx`                      | Email-domain extensions to the @cir/components catalog          |
| Pages               | `app/today/page.tsx`                                            | Just `<CirRoute path="/today" />`                               |
| Styling             | `app/globals.css`                                               | Tailwind 4 + `data-cir-component` selectors                     |

## How to swap in a real compiler (Phase 5)

The fake compiler in `app/api/manifest/[...slug]/route.ts` is a single switch on route name. Replace it with:

1. Anthropic API: call `claude.messages.create()` with the cached system prompt + capability/skill context, validate against `@cir/schemas` ManifestSchema, return JSON. **Needs `ANTHROPIC_API_KEY`.**
2. **Claude Code CLI** subprocess: `spawn('claude', ['-p', prompt])`, parse JSON from stdout. Uses your Pro/Max subscription instead of API credits.
3. **Codex CLI** subprocess: similar pattern with `codex`.
4. Any other model executor that meets `(context) → Manifest`.

See `docs/architecture.md` §"Compiler service in detail" for the full prompt structure and the diff-mode contract.

## Why Tailwind 4 + Next.js 15

Tailwind 4 is CSS-first (no `tailwind.config.js`). Next.js 15 is the current LTS. React Server Components route the boundary correctly because every CIR file that needs hooks ships a `'use client'` directive. See `packages/react/README.md` §"Next.js / React Server Components".

## Phase 4d additions

- **`/thread/[id]` route** + `ThreadView` component — renders an email thread with messages through the sanitized `Markdown` (GFM tables, strikethrough, autolinks; raw HTML stripped; `javascript:` URLs dropped; external links get `rel=noopener noreferrer`).
- **SSE trigger transport** — the runtime's `SseTriggerTransport` connects to `/api/triggers/stream` on mount; published triggers flow into the local bus and trigger cache invalidation. Try it:

  ```bash
  curl -XPOST http://localhost:3000/api/triggers/publish \
    -H 'content-type: application/json' \
    -d '{"type":"user.recompile_route","user_id":"demo-user","manifest_id":"m_demo_today","route":"/today"}'
  ```

  The browser will refetch `/today` automatically.

- **Playwright smoke tests** — `e2e/today.spec.ts` covers welcome banner, decision list, task list, navigation into thread view, GFM rendering, and SSE-driven invalidation.

  ```bash
  pnpm --filter @cir/demo e2e:install   # one-time chromium install
  pnpm --filter @cir/demo e2e
  ```

## What's still deferred

- Stale-while-revalidate (refresh in background while serving cached)
- Optimistic UI for action mutations (the dispatcher's undo stack is wired but the UI doesn't surface "undo" affordances yet)
- Cross-tab cache sync (the SSE bus already does this server-side; Tier-4 IDB cache would amplify the effect)

## Cross-references

- [`/ETHOS.md`](../../ETHOS.md) — the ten principles
- [`/AGENTS.md`](../../AGENTS.md) — what coding agents need to know about the layout
- [`/docs/architecture.md`](../../docs/architecture.md) — system overview
- [`/docs/artifacts.md`](../../docs/artifacts.md) — the canonical Manifest example this demo's `/today` route is built from
