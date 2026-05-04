// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Server-side resolver. Glues compiler + manifest store + audit emission
 * into one entry point that route handlers call:
 *
 *   const resolver = new ServerManifestResolver({ compiler, store, audit, validate });
 *   const result = await resolver.resolve(input);  // hit OR cold compile
 *
 * Trigger-driven invalidation lives here too: `invalidate(predicate)` walks
 * the store. Wire it from your trigger bus.
 */

import { ManifestSchema, type AuditEvent, type Manifest } from '@atelier/schemas';
import { CompilerOutputError, type CompileInput, type CompilerService } from './types.js';
import {
  type ManifestStore,
  type ManifestStoreKey,
  type StoredManifest,
} from './manifest-store.js';

export interface ResolveResult {
  manifest: Manifest;
  /** Where the manifest came from this request. */
  source: 'tier_3_cache' | 'fresh_compile';
  /** Tokens used (0 on cache hit). */
  token_cost: number;
  /** Compile duration in ms (0 on cache hit). */
  duration_ms: number;
  /** Compiler that produced it (most recent for the cached row, even on hit). */
  compiler_id: string;
  /** When it was originally compiled (ISO). */
  compiled_at: string;
  /** Cache key used. */
  key: ManifestStoreKey;
}

export type ServerAuditEmitter = (event: AuditEvent) => void | Promise<void>;

export interface ManifestValidationResult {
  ok: boolean;
  reasons?: readonly string[];
  policy_evaluations?: AuditEvent['policy_evaluations'];
}

export type ManifestValidator = (
  manifest: Manifest,
  input: CompileInput,
) => ManifestValidationResult | Promise<ManifestValidationResult>;

export interface ServerManifestResolverOptions {
  compiler: CompilerService;
  store: ManifestStore;
  audit?: ServerAuditEmitter;
  /**
   * Per-app key derivation. Allows hosts to control cache granularity. Default
   * uses everything in `CompileInput` available.
   */
  buildKey?: (input: CompileInput) => ManifestStoreKey;
  /**
   * Optional per-user daily token budget enforcement. Resolver throws
   * `BudgetExceededError` when blown. The host catches and falls back to
   * the prior cached manifest (stale-while-budget-exceeded).
   */
  budget?: {
    perUserDailyTokens: number;
    counter: TokenBudgetCounter;
  };
  /**
   * Optional host policy validator. The resolver always performs structural
   * ManifestSchema validation before storing; this hook adds app-specific
   * policy/composition validation at the central cache boundary.
   *
   * Production safety: in `NODE_ENV=production`, constructing a resolver
   * without this hook throws unless `allowUnvalidatedManifests` is explicitly
   * set. Use `createBaselineManifestValidator(...)` for the standard baseline
   * policy bridge.
   */
  validate?: ManifestValidator;
  /**
   * Explicit escape hatch for local demos/tests that intentionally exercise
   * schema-only compiler paths. Do not set this in production hosts.
   */
  allowUnvalidatedManifests?: boolean;
}

export interface TokenBudgetCounter {
  consumed(user_id: string): Promise<number>;
  add(user_id: string, tokens: number): Promise<void>;
}

/**
 * Discriminator for `BudgetExceededError` so callers / dashboards can
 * attribute a block to the specific budget axis that fired.
 *
 * - `'tokens_per_day'`: `max_tokens_per_day` (or the resolver-level
 *   `perUserDailyTokens`) was reached.
 * - `'calls_per_hour'`: `max_calls_per_hour` was reached.
 * - `'tokens_per_call'`: a single compile returned more tokens than
 *   `max_tokens_per_call` allowed. This is reported AFTER the call (the
 *   wrapper logs a warning via `onExceeded` rather than throwing — the
 *   manifest is already in hand so refusing it would just waste the spend).
 */
export type BudgetExceededCode = 'tokens_per_day' | 'calls_per_hour' | 'tokens_per_call';

export class BudgetExceededError extends Error {
  /**
   * Which budget axis fired. `'tokens_per_day'` is the legacy default for
   * the resolver-level guard (see `ServerManifestResolverOptions.budget`)
   * since that path only enforces the daily token cap. The compiler-layer
   * `BudgetMeteredCompiler` always sets a specific code.
   */
  readonly code: BudgetExceededCode;

  constructor(
    message: string,
    readonly user_id: string,
    readonly consumed: number,
    readonly cap: number,
    code: BudgetExceededCode = 'tokens_per_day',
  ) {
    super(message);
    this.name = 'BudgetExceededError';
    this.code = code;
  }
}

function defaultBuildKey(input: CompileInput): ManifestStoreKey {
  // Pick the highest version among supplied capabilities; falling back to '*'.
  let capabilityVersion: string | undefined;
  for (const c of Object.values(input.capabilities)) {
    if (c.version && (!capabilityVersion || c.version > capabilityVersion)) {
      capabilityVersion = c.version;
    }
  }
  return {
    user_id: input.user_id,
    app_id: input.app_id,
    route: input.route,
    capability_version: capabilityVersion,
    intent_profile_version: input.intent?.profile_version,
    brand_kit_version: input.brandKit?.version,
  };
}

export class ServerManifestResolver {
  readonly #compiler: CompilerService;
  readonly #store: ManifestStore;
  readonly #audit: ServerAuditEmitter | undefined;
  readonly #buildKey: (input: CompileInput) => ManifestStoreKey;
  readonly #budget: ServerManifestResolverOptions['budget'];
  readonly #validate: ManifestValidator | undefined;

  constructor(opts: ServerManifestResolverOptions) {
    if (
      !opts.validate &&
      !opts.allowUnvalidatedManifests &&
      process.env['NODE_ENV'] === 'production'
    ) {
      throw new Error(
        'ServerManifestResolver requires a manifest validator in production. Pass validate: createBaselineManifestValidator(...) or set allowUnvalidatedManifests only for non-production experiments.',
      );
    }
    this.#compiler = opts.compiler;
    this.#store = opts.store;
    this.#audit = opts.audit;
    this.#buildKey = opts.buildKey ?? defaultBuildKey;
    this.#budget = opts.budget;
    this.#validate = opts.validate;
  }

  async resolve(input: CompileInput, opts?: { forceRefresh?: boolean }): Promise<ResolveResult> {
    const key = this.#buildKey(input);

    if (!opts?.forceRefresh) {
      const cached = await this.#store.get(key);
      if (cached) {
        await this.#audit?.({
          event_id: `evt_served_${randomId()}`,
          timestamp: new Date().toISOString(),
          user_id: input.user_id,
          app_id: input.app_id,
          type: 'manifest.served',
          actor: 'system',
          before_state_hash: '',
          after_state_hash: '',
          trigger_chain: [],
          token_cost: 0,
          policy_evaluations: [],
          manifest_id: cached.manifest.manifest_id,
        });
        return {
          manifest: cached.manifest,
          source: 'tier_3_cache',
          token_cost: 0,
          duration_ms: 0,
          compiler_id: cached.compiler_id,
          compiled_at: cached.compiled_at,
          key,
        };
      }
    }

    // Budget gate.
    if (this.#budget) {
      const used = await this.#budget.counter.consumed(input.user_id);
      if (used >= this.#budget.perUserDailyTokens) {
        throw new BudgetExceededError(
          `User ${input.user_id} exceeded daily token cap (${String(used)}/${String(this.#budget.perUserDailyTokens)})`,
          input.user_id,
          used,
          this.#budget.perUserDailyTokens,
          'tokens_per_day',
        );
      }
    }

    // Cold path.
    const result = await this.#compiler.compile(input);
    const validation = await this.#validateCompiledManifest(result.manifest, input);
    const compiledAt = new Date().toISOString();
    const stored: StoredManifest = {
      manifest: validation.manifest,
      compiler_id: result.model,
      compiled_at: compiledAt,
      last_used: compiledAt,
      token_cost: result.token_cost,
      trigger_chain: input.trigger ? [input.trigger.type] : undefined,
    };
    await this.#store.set(key, stored);

    if (this.#budget) {
      await this.#budget.counter.add(input.user_id, result.token_cost);
    }

    await this.#audit?.({
      event_id: `evt_compiled_${randomId()}`,
      timestamp: compiledAt,
      user_id: input.user_id,
      app_id: input.app_id,
      type: 'manifest.compiled',
      actor: 'system',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: input.trigger ? [input.trigger.type] : [],
      token_cost: result.token_cost,
      policy_evaluations: validation.policy_evaluations,
      manifest_id: validation.manifest.manifest_id,
      // Phase 1.5: compile-narrative metadata for `<CompileBadge>`. The
      // model name (`gemini-2.5-pro` vs `fallback-hand-written`) lets the
      // user see which compiler served them; duration tells them how long
      // the LLM took. See `docs/ethos.md` principle #5 (visible compilation).
      compiler_model: result.model,
      duration_ms: result.duration_ms,
    });

    return {
      manifest: validation.manifest,
      source: 'fresh_compile',
      token_cost: result.token_cost,
      duration_ms: result.duration_ms,
      compiler_id: result.model,
      compiled_at: compiledAt,
      key,
    };
  }

  async #validateCompiledManifest(
    manifest: Manifest,
    input: CompileInput,
  ): Promise<{ manifest: Manifest; policy_evaluations: AuditEvent['policy_evaluations'] }> {
    const parsed = ManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (i) => `${i.path.join('.') || '<root>'}: ${i.message}`,
      );
      throw new CompilerOutputError('Compiled manifest failed ManifestSchema validation', issues);
    }

    if (!this.#validate) {
      return { manifest: parsed.data, policy_evaluations: [] };
    }

    const result = await this.#validate(parsed.data, input);
    if (!result.ok) {
      throw new CompilerOutputError(
        'Compiled manifest failed host policy validation',
        result.reasons ?? [],
      );
    }
    return {
      manifest: parsed.data,
      policy_evaluations: result.policy_evaluations ?? [],
    };
  }

  /**
   * Evict cache rows matching a predicate. Wire from your trigger bus —
   * e.g. on capability.schema_changed, evict where key.app_id matches.
   */
  async invalidate(
    predicate: (key: ManifestStoreKey, value: StoredManifest) => boolean,
  ): Promise<number> {
    return this.#store.evictMatching(predicate);
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
