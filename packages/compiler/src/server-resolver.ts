// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Server-side resolver. Glues compiler + manifest store + audit emission
 * into one entry point that route handlers call:
 *
 *   const resolver = new ServerManifestResolver({ compiler, store, audit });
 *   const result = await resolver.resolve(input);  // hit OR cold compile
 *
 * Trigger-driven invalidation lives here too: `invalidate(predicate)` walks
 * the store. Wire it from your trigger bus.
 */

import type { AuditEvent, Manifest } from '@cir/schemas';
import { type CompileInput, type CompilerService } from './types.js';
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
}

export interface TokenBudgetCounter {
  consumed(user_id: string): Promise<number>;
  add(user_id: string, tokens: number): Promise<void>;
}

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    readonly user_id: string,
    readonly consumed: number,
    readonly cap: number,
  ) {
    super(message);
    this.name = 'BudgetExceededError';
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

  constructor(opts: ServerManifestResolverOptions) {
    this.#compiler = opts.compiler;
    this.#store = opts.store;
    this.#audit = opts.audit;
    this.#buildKey = opts.buildKey ?? defaultBuildKey;
    this.#budget = opts.budget;
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
        );
      }
    }

    // Cold path.
    const result = await this.#compiler.compile(input);
    const compiledAt = new Date().toISOString();
    const stored: StoredManifest = {
      manifest: result.manifest,
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
      policy_evaluations: [],
      manifest_id: result.manifest.manifest_id,
    });

    return {
      manifest: result.manifest,
      source: 'fresh_compile',
      token_cost: result.token_cost,
      duration_ms: result.duration_ms,
      compiler_id: result.model,
      compiled_at: compiledAt,
      key,
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
