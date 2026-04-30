# @cir/compiler

The **LLM-backed compile service.** The only LLM-touching component in the hot system. Translates `(capabilities + skills + components + intent + brand kit + trigger)` into a valid manifest, validated by the policy engine before it leaves.

## Responsibilities

- Assemble the compile context: relevant capabilities (filtered by route + intent), relevant skills (filtered by capability set), full component catalog, scoped intent slice, trigger reason, previous manifest (when recompiling).
- Call the LLM with the cached system prompt + assembled context.
- Receive the manifest candidate, run it through the policy engine, retry on failure with the failure reason injected.
- Emit a brief diff explanation and a confidence score for the audit log.
- Run **diff mode** when a previous manifest exists — produce only the changes (saves 80%+ of tokens).
- Select the model tier per workload: routine recompile (small/fast), cold compile (large), cross-app workflow (large + extended context), trigger classification (tiny).

## `compileIntentProfile()` — LLM-assisted onboarding

A second, simpler compile entry point: take a user's free-text self-description ("I review GitHub PRs in the morning, I'm wary of automation, I prefer compact UIs") and emit a draft `IntentProfile` for them to review. Used by the demo's `/onboarding/describe` route as an alternative to the checkbox grant flow.

```ts
import {
  CompositeIntentProfileCompiler,
  GeminiIntentProfileCompiler,
  FallbackIntentProfileCompiler,
} from '@cir/compiler';

const compiler = new CompositeIntentProfileCompiler([
  new GeminiIntentProfileCompiler({ apiKey: process.env.GEMINI_API_KEY! }),
  new FallbackIntentProfileCompiler(),
]);
const result = await compiler.compileIntentProfile({
  description: userText,
  user_id,
  capabilities: [], // optionally constrain referenced capability ids
});
// result.profile is an IntentProfile DRAFT — never auto-save; show it to the user first.
```

Three implementations ship: `GeminiIntentProfileCompiler` (LLM, retries once on validation failure), `FallbackIntentProfileCompiler` (deterministic keyword heuristics — runs offline), and `CompositeIntentProfileCompiler` (tries services in order, falls back on throw). The compiler returns a draft; the caller is responsible for the human-review step before persisting.

## Tier-3 manifest cache: choosing a `ManifestStore`

The compiler service holds Tier-3 (server-side, cross-user) manifest cache state behind the `ManifestStore` interface. Two implementations ship:

| Use case                                | Store                 | Why                                                                                                               |
| --------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Local dev, single-process, tests        | `MemoryManifestStore` | Zero config, no external deps. State is per-process and lost on restart — fine for the inner loop and unit tests. |
| Production, multi-instance, persistence | `RedisManifestStore`  | Survives process restarts, shared across horizontally-scaled compilers. Trigger evictions reach every instance.   |

### Wire-up

```ts
import {
  CompositeCompiler,
  GeminiCompiler,
  FallbackCompiler,
  MemoryManifestStore,
  RedisManifestStore,
  ServerManifestResolver,
} from '@cir/compiler';
import { createClient } from 'redis';

const compiler = new CompositeCompiler([
  new GeminiCompiler({ apiKey: process.env.GEMINI_API_KEY! }),
  new FallbackCompiler({ lookup: manifestForRoute }),
]);

// Dev / single-process:
const store = new MemoryManifestStore({ maxEntries: 10_000 });

// Production / multi-instance:
const client = createClient({ url: process.env.REDIS_URL });
await client.connect(); // caller owns lifecycle
const prodStore = new RedisManifestStore({
  client,
  keyPrefix: 'cir:manifest:', // optional, default shown
  ttlSeconds: 60 * 60 * 24 * 7, // optional, 7 days default; 0 disables
});
// ...later, on shutdown:
await client.quit();

const resolver = new ServerManifestResolver({ compiler, store: prodStore });
```

### Key-shape compatibility

Both stores serialize the structured `ManifestStoreKey` the same way. Swapping `MemoryManifestStore` for `RedisManifestStore` does not require rebuilding routes or invalidating callers.

### Stats

`hits` / `misses` / `evictions` returned by `store.stats()` are **instance-local** for the Redis store — they reflect what this process has observed, not the cluster aggregate. Cluster-wide observability is a separate concern (see `docs/production-concerns.md`, "Observability").

## What does NOT live here

- The runtime (`../runtime/`) — never makes LLM calls.
- Inline LLM calls during render — explicitly forbidden by `../../AGENTS.md` ("Forbidden patterns"). Compile, cache, render — never inline.
- User intent — held by the vault, fetched by scope per compile.
