// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Manifest resolver — cache-first lookup, fetch on miss, optional policy
 * validation, audit on every transition.
 *
 * Flow (mirrors `/Users/vid/cir/docs/architecture.md` §"Hot path" and
 * §"Cold path"):
 *
 *   1. Build cache key from `(user_id, app_id, route)`.
 *   2. If `forceRefresh` is true, skip the cache check.
 *   3. Cache hit: emit `manifest.served`, refresh `last_used`, return manifest.
 *   4. Cache miss: fetch via `ManifestFetcher`. The resolver does NOT compile
 *      manifests itself (the compiler service does) — but it is the moment a
 *      fresh manifest enters the runtime, so we emit `manifest.compiled` to
 *      record the transition. Hosts that distinguish "compiled here" from
 *      "compiled upstream" should overlay their own audit semantics.
 *   5. Optionally run policy validation (provided via `validate`); failed
 *      validations are NOT cached and surface as `ManifestValidationError`.
 *   6. Stale cache is NOT served on fetch failure unless `forceRefresh` is
 *      false AND the caller explicitly opts in via a future flag (Phase 4c).
 *      Today, fetch errors bubble through.
 */

import type { AuditEvent, Manifest } from '@cir/schemas';
import type { AuditSink } from '../audit/emit.js';
import { NoopAuditSink } from '../audit/emit.js';
import { isoNow, type Clock } from '../types.js';
import type { CachedManifest, ManifestCache, ManifestCacheKey } from './cache.js';
import type { ManifestFetcher } from './fetcher.js';

export interface ManifestValidationOk {
  ok: true;
}
export interface ManifestValidationFail {
  ok: false;
  reasons?: string[];
}
export type ManifestValidationResult = ManifestValidationOk | ManifestValidationFail;

export interface ManifestResolverOptions {
  fetcher: ManifestFetcher;
  cache: ManifestCache;
  /**
   * Optional policy validation gate. Manifests failing validation are
   * rejected (NOT cached) and the resolver throws `ManifestValidationError`.
   * Hosts that want lenient mode can omit this.
   */
  validate?: (manifest: Manifest) => ManifestValidationResult;
  /** Audit sink. Defaults to `NoopAuditSink`. */
  audit?: AuditSink;
  /** Override `Date.now` for tests. */
  clock?: Clock;
  /**
   * Stale-while-revalidate. When `true` and the cache returns an entry with
   * `stale === true`, the resolver returns it immediately and kicks off a
   * background refresh (fetch + validate + cache write). The background work
   * is fire-and-forget; failures are reported via `onBackgroundError` if
   * provided, otherwise swallowed. Default `false` (stale entries fall
   * through to a normal fresh fetch).
   *
   * Pairs with `wireTriggerInvalidation({ markStaleInsteadOfEvict: true })`:
   * a trigger marks matching entries stale, the next read serves them
   * immediately, and a fresh manifest replaces them in the background. See
   * `/Users/vid/cir/docs/caching.md` §"Semantic invalidation".
   */
  staleWhileRevalidate?: boolean;
  /**
   * Reports errors thrown by background refresh attempts when SWR is on.
   * Best-effort; the resolver never re-throws background failures because
   * the user has already been served the (stale) manifest.
   */
  onBackgroundError?: (error: unknown, key: ManifestCacheKey) => void;
}

export interface ResolveOptions {
  /** Skip the cache check; always fetch. */
  forceRefresh?: boolean;
}

export class ManifestValidationError extends Error {
  readonly reasons: readonly string[];
  readonly key: ManifestCacheKey;
  constructor(key: ManifestCacheKey, reasons: readonly string[]) {
    super(
      `Manifest validation failed for ${key.user_id}/${key.app_id}${key.route}${
        reasons.length ? `: ${reasons.join('; ')}` : ''
      }`,
    );
    this.name = 'ManifestValidationError';
    this.key = key;
    this.reasons = reasons;
  }
}

let auditSeq = 0;
function nextAuditId(): `evt_${string}` {
  auditSeq += 1;
  // The audit schema requires `evt_` + lowercase alphanumerics. We mint a
  // best-effort local ID; production hosts can replace it via their sink.
  const rand = Math.random().toString(36).slice(2, 10);
  return `evt_${Date.now().toString(36)}${auditSeq.toString(36)}${rand}`;
}

export class ManifestResolver {
  readonly #fetcher: ManifestFetcher;
  readonly #cache: ManifestCache;
  readonly #validate: ((m: Manifest) => ManifestValidationResult) | undefined;
  readonly #audit: AuditSink;
  readonly #clock: Clock;
  readonly #swr: boolean;
  readonly #onBackgroundError: ((error: unknown, key: ManifestCacheKey) => void) | undefined;
  /** Per-key in-flight background refreshes. Coalesces concurrent SWR reads. */
  readonly #inflight = new Map<string, Promise<void>>();

  constructor(opts: ManifestResolverOptions) {
    this.#fetcher = opts.fetcher;
    this.#cache = opts.cache;
    this.#validate = opts.validate;
    this.#audit = opts.audit ?? NoopAuditSink;
    this.#clock = opts.clock ?? isoNow;
    this.#swr = opts.staleWhileRevalidate ?? false;
    this.#onBackgroundError = opts.onBackgroundError;
  }

  async resolve(key: ManifestCacheKey, opts: ResolveOptions = {}): Promise<Manifest> {
    if (!opts.forceRefresh) {
      const cached = await this.#cache.get(key);
      if (cached) {
        // Stale entry handling. Without SWR, a stale entry is treated like a
        // miss (same as `evictMatching`). With SWR, we serve it immediately
        // and refresh in the background.
        if (cached.stale === true) {
          if (this.#swr) {
            const updated: CachedManifest = { ...cached, last_used: this.#clock() };
            await this.#cache.set(key, updated);
            await this.#emitServed(key, cached.manifest);
            void this.#refreshInBackground(key);
            return cached.manifest;
          }
          // SWR off: fall through to fetch.
        } else {
          const updated: CachedManifest = { ...cached, last_used: this.#clock() };
          await this.#cache.set(key, updated);
          await this.#emitServed(key, cached.manifest);
          return cached.manifest;
        }
      }
    }

    return this.#fetchAndStore(key);
  }

  async #fetchAndStore(key: ManifestCacheKey): Promise<Manifest> {
    const fetched = await this.#fetcher.fetch(key);

    if (this.#validate) {
      const result = this.#validate(fetched.manifest);
      if (!result.ok) {
        const reasons = result.reasons ?? [];
        await this.#emitPolicyViolated(key, fetched.manifest, reasons);
        throw new ManifestValidationError(key, reasons);
      }
    }

    const now = this.#clock();
    const cached: CachedManifest = {
      manifest: fetched.manifest,
      fetched_at: now,
      last_used: now,
      ...(fetched.etag ? { etag: fetched.etag } : {}),
    };
    await this.#cache.set(key, cached);
    await this.#emitCompiled(key, fetched.manifest);
    return fetched.manifest;
  }

  /**
   * Fire-and-forget background refresh used by the SWR path. Errors are
   * reported via `onBackgroundError` (if provided) and otherwise swallowed
   * — the foreground caller already received the stale manifest.
   *
   * Multiple SWR reads on the same key share one in-flight refresh.
   */
  #refreshInBackground(key: ManifestCacheKey): Promise<void> {
    const serialized = `${key.user_id}:${key.app_id}:${key.route}`;
    const existing = this.#inflight.get(serialized);
    if (existing) return existing;
    const task = this.#fetchAndStore(key)
      .then(() => undefined)
      .catch((err: unknown) => {
        this.#onBackgroundError?.(err, key);
      })
      .finally(() => {
        this.#inflight.delete(serialized);
      });
    this.#inflight.set(serialized, task);
    return task;
  }

  async #emitServed(key: ManifestCacheKey, manifest: Manifest): Promise<void> {
    await this.#emit({
      event_id: nextAuditId(),
      timestamp: this.#clock(),
      user_id: key.user_id,
      app_id: key.app_id,
      type: 'manifest.served',
      actor: 'system',
      before_state_hash: '',
      after_state_hash: manifest.manifest_id,
      trigger_chain: [`route:${key.route}`],
      token_cost: 0,
      policy_evaluations: [],
      manifest_id: manifest.manifest_id,
    });
  }

  async #emitCompiled(key: ManifestCacheKey, manifest: Manifest): Promise<void> {
    await this.#emit({
      event_id: nextAuditId(),
      timestamp: this.#clock(),
      user_id: key.user_id,
      app_id: key.app_id,
      type: 'manifest.compiled',
      actor: 'system',
      before_state_hash: '',
      after_state_hash: manifest.manifest_id,
      trigger_chain: [`route:${key.route}`, 'cache_miss'],
      token_cost: 0,
      policy_evaluations: [],
      manifest_id: manifest.manifest_id,
    });
  }

  async #emitPolicyViolated(
    key: ManifestCacheKey,
    manifest: Manifest,
    reasons: readonly string[],
  ): Promise<void> {
    await this.#emit({
      event_id: nextAuditId(),
      timestamp: this.#clock(),
      user_id: key.user_id,
      app_id: key.app_id,
      type: 'policy.violated',
      actor: 'system',
      before_state_hash: '',
      after_state_hash: manifest.manifest_id,
      trigger_chain: [`route:${key.route}`],
      token_cost: 0,
      policy_evaluations: reasons.map((reason) => ({
        policy_id: 'manifest_validate',
        passed: false,
        detail: reason,
      })),
      manifest_id: manifest.manifest_id,
    });
  }

  async #emit(event: AuditEvent): Promise<void> {
    try {
      await this.#audit.emit(event);
    } catch {
      // Audit is best-effort; never block resolution on a sink failure.
    }
  }
}
