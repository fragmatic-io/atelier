// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Manifest fetcher — HTTP client for the Manifest Store.
 *
 * Wraps `globalThis.fetch` (or an injected fetch for tests). Honors
 * `AbortSignal`. Retries on network errors and 5xx responses with exponential
 * backoff. 4xx responses are non-retriable.
 *
 * URL shape mirrors the Manifest Store contract in
 * `/Users/vid/cir/docs/architecture.md` §"Service contracts":
 *
 *   GET {baseUrl}/manifest/{user_id}/{app_id}/{routePath}
 *
 * The route path is URI-component-encoded so leading `/` and other URL-
 * unsafe characters survive the round trip.
 */

import type { Manifest } from '@cir/schemas';
import type { ManifestCacheKey } from './cache.js';

export interface ManifestFetcherOptions {
  /** Base URL of the Manifest Store (e.g. `https://manifest.example.com`). */
  baseUrl: string;
  /** Replace the global fetch. Required in tests; optional in browsers. */
  fetch?: typeof globalThis.fetch;
  /** Abort signal for cooperative cancellation. */
  signal?: AbortSignal;
  /** How many times to retry retriable failures. Default 2. */
  retries?: number;
  /** Initial backoff delay in ms (doubles each retry). Default 250. */
  retryDelayMs?: number;
}

export interface FetchedManifest {
  manifest: Manifest;
  etag?: string;
}

/** Thrown when the Manifest Store returns an HTTP status we cannot recover from. */
export class ManifestFetchError extends Error {
  readonly status: number;
  readonly key: ManifestCacheKey;
  constructor(status: number, key: ManifestCacheKey, body?: string) {
    super(
      `Manifest fetch failed: HTTP ${status} for ${key.user_id}/${key.app_id}${key.route}${
        body ? ` — ${body}` : ''
      }`,
    );
    this.name = 'ManifestFetchError';
    this.status = status;
    this.key = key;
  }
}

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

export class ManifestFetcher {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #signal: AbortSignal | undefined;
  readonly #retries: number;
  readonly #retryDelayMs: number;

  constructor(opts: ManifestFetcherOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.#signal = opts.signal;
    this.#retries = opts.retries ?? DEFAULT_RETRIES;
    this.#retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async fetch(key: ManifestCacheKey): Promise<FetchedManifest> {
    const url = this.#buildUrl(key);
    let attempt = 0;
    let lastError: unknown;
    // The first call counts as attempt 0; we permit up to `retries` retries.
    // Total attempts therefore equals `retries + 1`.
    while (attempt <= this.#retries) {
      this.#throwIfAborted();
      try {
        const response = await this.#fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          ...(this.#signal ? { signal: this.#signal } : {}),
        });
        if (response.ok) {
          const manifest = (await response.json()) as Manifest;
          const etag = response.headers.get('etag') ?? undefined;
          return etag ? { manifest, etag } : { manifest };
        }
        // 4xx -> non-retriable.
        if (response.status >= 400 && response.status < 500) {
          const body = await response.text().catch(() => '');
          throw new ManifestFetchError(response.status, key, body);
        }
        // 5xx -> retriable.
        lastError = new ManifestFetchError(response.status, key);
      } catch (err) {
        // Re-throw both abort and the deliberate non-retriable 4xx error.
        if (isAbortError(err)) throw err;
        if (err instanceof ManifestFetchError && err.status >= 400 && err.status < 500) {
          throw err;
        }
        lastError = err;
      }
      attempt += 1;
      if (attempt > this.#retries) break;
      await this.#sleep(this.#retryDelayMs * 2 ** (attempt - 1));
    }
    // We've exhausted retries. Surface whatever was last seen.
    if (lastError instanceof Error) throw lastError;
    throw new Error(`Manifest fetch failed for ${this.#buildUrl(key)}`);
  }

  #buildUrl(key: ManifestCacheKey): string {
    const u = encodeURIComponent(key.user_id);
    const a = encodeURIComponent(key.app_id);
    const r = encodeURIComponent(key.route);
    return `${this.#baseUrl}/manifest/${u}/${a}/${r}`;
  }

  #throwIfAborted(): void {
    if (this.#signal?.aborted) {
      const reason: unknown = this.#signal.reason;
      throw reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError');
    }
  }

  async #sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (this.#signal) {
        const onAbort = (): void => {
          clearTimeout(timer);
          const reason: unknown = this.#signal?.reason;
          reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'));
        };
        if (this.#signal.aborted) onAbort();
        else this.#signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
