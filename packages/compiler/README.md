# @cir/compiler

The **LLM-backed compile service.** The only LLM-touching component in the hot system. Translates `(capabilities + skills + components + intent + trigger)` into a valid manifest, validated by the policy engine before it leaves.

## Responsibilities

- Assemble the compile context: relevant capabilities (filtered by route + intent), relevant skills (filtered by capability set), full component catalog, scoped intent slice, trigger reason, previous manifest (when recompiling).
- Call the LLM with the cached system prompt + assembled context.
- Receive the manifest candidate, run it through the policy engine, retry on failure with the failure reason injected.
- Emit a brief diff explanation and a confidence score for the audit log.
- Run **diff mode** when a previous manifest exists — produce only the changes (saves 80%+ of tokens).
- Select the model tier per workload: routine recompile (small/fast), cold compile (large), cross-app workflow (large + extended context), trigger classification (tiny).

## Background

See [`../../docs/architecture.md`](../../docs/architecture.md) — section "Compiler service in detail" for the full prompt structure, the diff-mode contract, and the model-tier selection rationale. Token-budget guidance is in [`../../AGENTS.md`](../../AGENTS.md) ("Token budget") and [`../../docs/token-economics.md`](../../docs/token-economics.md).

## Files

Standard TypeScript service: `src/` (entry, prompt builders, model adapter, policy retry loop), `prompts/` (versioned system prompts), `tests/`, `package.json`.

## What does NOT live here

- The runtime (`../runtime/`) — never makes LLM calls.
- Inline LLM calls during render — explicitly forbidden by [`../../AGENTS.md`](../../AGENTS.md) ("Forbidden patterns"). Compile, cache, render — never inline.
- User intent — held by the vault, fetched by scope per compile.

## Status

Stub package in Phase 2 (workspace plumbing only). Source lands starting in **Phase 5 (hello-CIR loop)** with a single-tier compiler service serving the email vertical slice. Multi-tier model selection lands in Phase 3 of the build plan (production hardening).
