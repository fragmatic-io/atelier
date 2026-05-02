// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tiny REST helper around `https://api.github.com`. Two responsibilities:
 *
 *   1. Inject `Authorization: token <token>` when a token is configured
 *      (env or vault). Never logs the token in any code path; even when
 *      throwing on errors the error message is built from `status`/url
 *      only.
 *
 *   2. Capture rate-limit headers (`x-ratelimit-remaining`,
 *      `x-ratelimit-limit`, `x-ratelimit-reset`) and surface them via the
 *      module-level `getRateLimitState()`. The `<StatusBar>` on the chrome
 *      reads this for the operational/degraded/incident pill.
 *
 * If no token is set, the client falls back to fixture data. Calls are
 * mocked in tests by injecting an alternate `fetch` via the `fetchImpl`
 * option on the resolver factory.
 */

import {
  FIXTURE_ISSUES,
  FIXTURE_REPOS,
  type GitHubIssue,
  type GitHubRepo,
} from './github-fixtures.js';

/** Public rate-limit state surfaced by the resolver via getter. */
export interface RateLimitState {
  readonly limit: number;
  readonly remaining: number;
  readonly reset_at: number; // unix seconds
  readonly status: 'operational' | 'degraded' | 'incident';
  readonly last_updated: number; // unix ms
}

const DEFAULT_RATE_LIMIT_STATE: RateLimitState = {
  limit: 5000,
  remaining: 5000,
  reset_at: 0,
  status: 'operational',
  last_updated: 0,
};

let rateLimitState: RateLimitState = DEFAULT_RATE_LIMIT_STATE;

/** Read the latest rate-limit snapshot. Pure read. */
export function getRateLimitState(): RateLimitState {
  return rateLimitState;
}

/** Compute the user-facing status bucket from a remaining/limit pair. */
export function classifyRateLimit(remaining: number, limit: number): RateLimitState['status'] {
  if (limit <= 0) return 'operational';
  if (remaining <= 0) return 'incident';
  const ratio = remaining / limit;
  if (ratio < 0.1) return 'incident';
  if (ratio < 0.25) return 'degraded';
  return 'operational';
}

/**
 * Update the cached snapshot from a `Response` (only when the relevant
 * headers are present). Defensive: never throws; missing headers leave
 * the state untouched.
 */
export function updateRateLimitFromHeaders(headers: Headers): void {
  const limitRaw = headers.get('x-ratelimit-limit');
  const remainingRaw = headers.get('x-ratelimit-remaining');
  const resetRaw = headers.get('x-ratelimit-reset');
  if (limitRaw === null && remainingRaw === null) return;
  const limit = limitRaw === null ? rateLimitState.limit : Number.parseInt(limitRaw, 10);
  const remaining =
    remainingRaw === null ? rateLimitState.remaining : Number.parseInt(remainingRaw, 10);
  const reset_at = resetRaw === null ? rateLimitState.reset_at : Number.parseInt(resetRaw, 10);
  const status = classifyRateLimit(remaining, limit);
  rateLimitState = {
    limit: Number.isFinite(limit) ? limit : rateLimitState.limit,
    remaining: Number.isFinite(remaining) ? remaining : rateLimitState.remaining,
    reset_at: Number.isFinite(reset_at) ? reset_at : rateLimitState.reset_at,
    status,
    last_updated: Date.now(),
  };
}

/** Test-only: reset the module-level cached state. */
export function _resetRateLimitForTesting(): void {
  rateLimitState = DEFAULT_RATE_LIMIT_STATE;
}

/** Override the snapshot directly. The settings page uses this when a
 * sandbox host wants to demo "approaching limit" without burning real
 * calls. Safe because it's pure data — no network. */
export function setRateLimitState(next: RateLimitState): void {
  rateLimitState = next;
}

/**
 * Build the auth header set. Returns `{}` when no token is provided
 * (anonymous request — fine for fixture-only deployments).
 */
export function authHeaders(token: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token && token.length > 0) headers['authorization'] = `token ${token}`;
  return headers;
}

/** Compose a redacted error message — never includes the token. */
export function buildErrorMessage(url: string, status: number): string {
  // Strip query params that GitHub never echoes secrets through, but
  // belt-and-suspenders: the token is in headers, never the URL. The
  // sanitised message includes only the path + status.
  let path: string;
  try {
    const u = new URL(url);
    path = `${u.host}${u.pathname}`;
  } catch {
    path = '<malformed-url>';
  }
  return `github: HTTP ${String(status)} for ${path}`;
}

export interface GitHubClientOptions {
  readonly token?: string | null;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
}

/**
 * Minimal client. The data-resolver wraps this; routes can call the
 * client directly for one-off mutations (issue.create / issue.close).
 */
export class GitHubClient {
  readonly #token: string | null;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(options: GitHubClientOptions = {}) {
    this.#token = options.token ?? null;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#baseUrl = options.baseUrl ?? 'https://api.github.com';
  }

  /** True when a real token is configured. Otherwise the client falls back to fixtures. */
  get authenticated(): boolean {
    return this.#token !== null && this.#token.length > 0;
  }

  /**
   * GET a JSON endpoint. Updates the rate-limit snapshot side-effectfully.
   * Throws on non-2xx with a redacted error message.
   */
  async getJson<T>(path: string): Promise<T> {
    const url = `${this.#baseUrl}${path}`;
    const res = await this.#fetch(url, { headers: authHeaders(this.#token) });
    updateRateLimitFromHeaders(res.headers);
    if (!res.ok) throw new Error(buildErrorMessage(url, res.status));
    return (await res.json()) as T;
  }

  /** POST JSON. Same redaction discipline as GET. */
  async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.#baseUrl}${path}`;
    const res = await this.#fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(this.#token), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    updateRateLimitFromHeaders(res.headers);
    if (!res.ok) throw new Error(buildErrorMessage(url, res.status));
    return (await res.json()) as T;
  }

  /** PATCH JSON (used to close issues). */
  async patchJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.#baseUrl}${path}`;
    const res = await this.#fetch(url, {
      method: 'PATCH',
      headers: { ...authHeaders(this.#token), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    updateRateLimitFromHeaders(res.headers);
    if (!res.ok) throw new Error(buildErrorMessage(url, res.status));
    return (await res.json()) as T;
  }
}

/**
 * Fixture-backed implementation of the same surface: when no token is
 * set we serve the canned data instead of hitting the network. The two
 * paths return the same shape so the rendering surface is unaware of
 * which one is wired.
 */
export function listReposFixture(): readonly GitHubRepo[] {
  return FIXTURE_REPOS;
}

export function listIssuesFixture(): readonly GitHubIssue[] {
  return FIXTURE_ISSUES;
}
