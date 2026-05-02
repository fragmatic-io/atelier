# Deployment Paths

The framework works across apps, websites, chat, agents, mobile, native. The implementation paths differ. This file covers apps and websites in detail; for chat / agent / voice surfaces, see [`chat/deployment-scenarios.md`](chat/deployment-scenarios.md).

---

## First-party apps (the inside-out path)

The app is built Atelier-native from day one.

```
your-app/
  capabilities/         (your public surface)
  skills/               (your usage knowledge)
  components/           (your design system + extensions)
  policies/             (your safety rules)
  recipes/              (your default lenses per persona)
  evals/                (your test suite)
  runtime/              (your render SDK)
  .well-known/cir.json  (your discovery doc)
```

The default UI users see is just a recipe — `recipes/default.json` — that the company maintains. Everything users do via "customize" produces alternate manifests. The default is no more privileged than any user's lens, except that it ships with the app.

Companies migrating existing apps to Atelier start by:

1. Extracting capabilities from existing API endpoints
2. Writing skills for common usage patterns
3. Cataloguing existing components with schemas
4. Authoring policies from existing access controls
5. Compiling the existing UI into a default recipe
6. Shipping the runtime
7. Opening the customize flow incrementally

This is a 6-12 month migration for a mid-size SaaS app.

---

## Existing websites (the outside-in path)

The website is not Atelier-native. The user wants their interface anyway.

This is the **sidecar path**:

```
Browser extension or local agent
  ↓
1. Detects supported app (e.g., Gmail, GitHub, Linear)
2. Loads pre-built capability adapter for that app
3. Loads pre-built component catalog (shared)
4. Reads user intent vault
5. Renders alternate UI in an overlay or replacement view
6. Routes actions through adapter to original app's API or DOM
```

Adapters per app: `gmail.cir-adapter.json`, `github.cir-adapter.json`, etc. The adapter maps:

- App's data → Atelier-typed data
- App's actions → Atelier capabilities
- App's permissions → Atelier scopes

Adapters can be community-maintained. Quality varies. Reliability is lower than first-party Atelier. But this is the path that makes Atelier usable today, before any SaaS company implements it natively.

---

## Hybrid: cooperating websites

The best path is somewhere in between. A website ships a `/.well-known/cir.json` advertising:

```json
{
  "version": "1.0",
  "mode": "partial",
  "exposes": {
    "capabilities": "/api/cir/capabilities",
    "components": null,
    "skills": "/api/cir/skills"
  },
  "auth": "oauth2://api.example.com/oauth/authorize",
  "permissions_required": ["read:emails", "write:tasks"],
  "rate_limit": "1000/min/user"
}
```

The website doesn't ship a component catalog (the user's agent uses the shared catalog) or a render runtime (the agent provides one). But it does expose its capabilities cleanly. This is the lightest possible cooperation — the company keeps full control of its backend and just needs to expose a typed API surface.

This will probably be the most common shape: companies expose CIR-style capability surfaces, and a small number of "render runtime" providers (browser-based, agent-based, OS-integrated) become the universal interface layer.

---

## Mobile and native

Mobile is harder because:

- App stores restrict dynamic code execution
- Native UI cannot be HTML-generated
- Performance budgets are tighter

The right approach is **declarative manifests rendered by native components**:

- iOS: SwiftUI components registered to manifest schema
- Android: Compose components registered to manifest schema
- Manifests are JSON, not code — passes app store review
- Compiler service runs server-side, manifest is fetched

This is exactly what Google's A2UI is gesturing at — the cross-platform "blueprint" approach. Atelier's manifest format is compatible with this model; the same manifest can render on web, iOS, Android, and desktop with the appropriate native component set.
