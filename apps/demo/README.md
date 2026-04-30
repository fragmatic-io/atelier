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

> **Note on `validate:data`:** the workspace's `cir-schemas validate-data` walks `capabilities/`, `skills/`, `recipes/`, `policies/`, and `components/` at the repo root. The repo ships ~15 reference artifacts; expect that count to grow as more domains land. Use `--strict` to also fail on `_review` envelope drafts.

## How to swap in a real compiler

The fake compiler in `app/api/manifest/[...slug]/route.ts` is a single switch on route name. Replace it with `@cir/compiler`'s `GeminiCompiler` (set `GEMINI_API_KEY`) wrapped in a `CompositeCompiler` with a `FallbackCompiler` so the demo still boots without a key. Or drop in any other model executor that meets `(context) → Manifest`:

1. **`@cir/compiler` `GeminiCompiler`** — Gemini integration with cached system prompt and `@cir/schemas` response-schema validation. Use `MemoryManifestStore` for dev, `RedisManifestStore` for multi-instance prod.
2. Anthropic API: call `claude.messages.create()` with the cached system prompt + capability/skill context, validate against `@cir/schemas` `ManifestSchema`, return JSON. **Needs `ANTHROPIC_API_KEY`.**
3. **Claude Code CLI** subprocess: `spawn('claude', ['-p', prompt])`, parse JSON from stdout. Uses your Pro/Max subscription instead of API credits.
4. **Codex CLI** subprocess: similar pattern with `codex`.

See `docs/architecture.md` §"Compiler service in detail" for the full prompt structure and the diff-mode contract.

## Why Tailwind 4 + Next.js 15

Tailwind 4 is CSS-first (no `tailwind.config.js`). Next.js 15 is the current LTS. React Server Components route the boundary correctly because every CIR file that needs hooks ships a `'use client'` directive. See `packages/react/README.md` §"Next.js / React Server Components".

## Sanitized markdown, SSE invalidation, Playwright

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

## First-run onboarding

When you boot the demo with a clean browser profile, `/` lands on `/onboarding` instead of `/today`. The grant screen lists the three lens scopes the email-triage demo asks for (`lens.today`, `lens.thread`, `vocabulary.read`), with **Grant all**, **Customize** (per-scope checkboxes), and **Deny** affordances. Granting writes a minimal `IntentProfile` to `localStorage` under the key `cir.demo.intent`; the `/today` route then loads and the user proceeds. Denying lands on `/onboarding/denied` with a "restart" button.

Once granted, `/settings/intent` shows the granted lenses with **Revoke this lens** per row and a **Revoke all and re-onboard** button at the bottom. Revoking the last lens (or revoking all) clears the storage slot and bounces back to `/onboarding`.

> **This is a demo-only localStorage shim, not the production vault.** The shape stored under `cir.demo.intent` validates against `@cir/schemas`'s `IntentProfileSchema` so the swap to a real backend is a one-file change. Look for `TODO(vault):` markers in `apps/demo/lib/intent-store.ts`, `apps/demo/app/onboarding/page.tsx`, and `apps/demo/app/settings/intent/page.tsx` — those are the only places that touch the storage layer.

### LLM-assisted onboarding

Alongside the checkbox flow, the grant screen offers **"Or describe yourself in your own words →"**. That route (`/onboarding/describe`) takes a few sentences ("I review GitHub PRs in the morning, I shop online a lot, I prefer compact UIs and dark mode, I'm wary of automation"), POSTs them to `/api/cir/onboarding/compile`, and lands on `/onboarding/review` with a draft `IntentProfile` filled in. The user edits each field — lenses, rules, vocabulary, density / color mode / automation trust — and clicks **Save profile** to persist it via `saveIntentProfile()`.

> **Privacy posture.** The description is sent to Gemini once and discarded server-side. The route handler (`app/api/cir/onboarding/compile/route.ts`) marks the request body as request-scoped only — it never persists, never logs, never echoes the description anywhere downstream. Only the structured profile flows further, and only after the human gate on `/onboarding/review`. When `GEMINI_API_KEY` is unset, the deterministic `FallbackIntentProfileCompiler` (keyword heuristics in `@cir/compiler`) returns a draft so the flow boots offline.

## Live audit stream

The demo exposes the `/api/cir/audit/stream` SSE contract documented in
[`packages/cli/README.md`](../../packages/cli/README.md) §`cir dev --tail`.
Anything the server-side `StreamingAuditSink` emits — manifest compiles
cascading through Gemini → fallback, manifests served from the cache, policy
evaluations, action dispatches — flows live to any subscriber.

```bash
# 1) Run the demo (or use `cir dev --tail` which spawns it for you).
pnpm --filter @cir/demo dev

# 2) Watch the audit stream from the terminal.
curl -N http://localhost:3000/api/cir/audit/stream

# 3) Or use the CIR CLI's tailer (color-cued severity bands, auto-reconnect).
pnpm cir dev --tail
# → spawns `next dev` AND tails the audit stream
pnpm cir dev --tail-only
# → assumes the dev server is already running, just tails
```

Sample frame as written to the wire (one event per blank-line block):

```
event: manifest.served
data: {"event_id":"evt_01...","timestamp":"2026-04-30T12:34:56.789Z","type":"manifest.served","actor":"system","manifest_id":"m_a7b3c9d1",...}

event: heartbeat
data: {}
```

Heartbeats fire every 15s so a stale TCP connection is detected. The endpoint
also accepts two optional query filters:

- `?type=action.executed,policy.violated` — comma-separated `AuditEventType`
  values; only matching events flow through.
- `?tenant_id=t_x` — narrow to events scoped to that tenant. The demo isn't
  multi-tenant today so the filter is contract-ready: events without a
  `tenant_id` are treated as global and pass any tenant filter, matching the
  semantics every downstream host inherits when it adds tenancy.

Implementation lives in `lib/audit-stream.ts` (testable helper) +
`app/api/cir/audit/stream/route.ts` (Next.js adapter). The unit tests in
`test/audit-stream.test.ts` exercise the SSE encoding, both filter modes,
the heartbeat schedule, and the disconnect-cleanup path without needing
to spin up Next.js.

## What's still deferred

- Stale-while-revalidate (refresh in background while serving cached)
- Optimistic UI for action mutations (the dispatcher's undo stack is wired but the UI doesn't surface "undo" affordances yet)
- Cross-tab cache sync (the SSE bus already does this server-side; Tier-4 IDB cache would amplify the effect)

## Cross-references

- [`/ETHOS.md`](../../ETHOS.md) — the ten principles
- [`/AGENTS.md`](../../AGENTS.md) — what coding agents need to know about the layout
- [`/docs/architecture.md`](../../docs/architecture.md) — system overview
- [`/docs/artifacts.md`](../../docs/artifacts.md) — the canonical Manifest example this demo's `/today` route is built from
