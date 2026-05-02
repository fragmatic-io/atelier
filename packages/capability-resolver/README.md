# `@atelier/capability-resolver`

Capability scoping for the C-2 `ToolUsingCompiler` (Wave 10 / S-1; also tracked as Wave C / Phase C-3).

## What this is

Past ~200 capabilities, stuffing every schema into the cold prompt no longer fits the budget. C-2 (`ToolUsingCompiler`) made that better — the agent discovers capabilities on demand via tools — but the agent is still walking a registry that may not fit. **Two-stage compile** is the orthogonal axis: pre-pass the registry with a cheap model, hand the slim result to the expensive model.

This package ships:

- `CapabilityResolver` — abstract scoping interface.
- `SubstringCapabilityResolver` — fast / free baseline. Same logic as `@atelier/compiler`'s `fallbackFindCapability` but tunable + properly tested.
- `TwoStageCapabilityResolver` — production. Stage 1 calls a tiny model (Gemini Flash by default) on 1-line registry summaries and returns the top-K capability ids. Stage 2 is the host's existing primary compiler.
- `MemoryScopingCache` — in-memory cache keyed by `(userId, appId, route, intentHash)`.
- `semanticSearchFromResolver` / `semanticSearchFromLookup` — bridge to `@atelier/compiler`'s `SemanticSearch` seam.

## When to use which

| Resolver                         | Cost                                    | Quality                                      | Use when                                                                  |
| -------------------------------- | --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| `SubstringCapabilityResolver`    | free                                    | low (no semantic understanding)              | dev, tests, registries < 50 capabilities, or when no LLM key is available |
| `TwoStageCapabilityResolver`     | one tiny-model call per intent (cached) | good — picks 30/200+ correctly in most cases | production hosts with > 150 capabilities                                  |
| `S-7` vector embeddings (future) | indexing + vector lookup                | best                                         | when stage-1 quality ceiling is hit (registries >1000)                    |

## Wire-up

```ts
import {
  SubstringCapabilityResolver,
  TwoStageCapabilityResolver,
  semanticSearchFromResolver,
} from '@atelier/capability-resolver';
import { ToolUsingCompiler, GeminiAgentClient } from '@atelier/compiler';

const resolver = process.env.CIR_CAPABILITY_SCOPING_ENABLED === '1'
  ? new TwoStageCapabilityResolver({
      client: myGeminiFlashScopingClient,
      // recordTokens hooks into your BudgetCounter so stage-1 spend
      // counts against `max_tokens_per_day` / `max_calls_per_hour`.
      recordTokens: ({ userId, appId, tokens }) =>
        budgetCounter.record(userId, appId, tokens),
    })
  : new SubstringCapabilityResolver();

const primed = semanticSearchFromResolver(resolver, {
  registry: CAPABILITIES,
  request: { userId, appId, route, intent: userIntent },
});

// Once per compile: prime stage 1 so the C-2 sync `findCapability`
// tool reads the resolver result.
await primed.prime(userIntent, 30);

const compiler = new ToolUsingCompiler({
  inner: new GeminiAgentClient({ apiKey }),
  env: { capabilities: CAPABILITIES, components, validate, ... },
  search: primed.search,
});
```

## Cascade story

Stage-1 failures (LLM error, malformed reply, abort) cascade automatically to a configured fallback resolver — by default a fresh `SubstringCapabilityResolver`. The compile never fails because of a stage-1 hiccup. Hosts that want audit visibility wire the `onStageOneFailure` observer.

## Cost discipline

Stage-1 calls are real LLM calls. Pass `recordTokens` to attribute them to your `BudgetCounter` so they count against `max_tokens_per_day` / `max_calls_per_hour`. The resolver does not enforce budgets itself — that's `@atelier/compiler`'s `BudgetMeteredCompiler`'s job.
