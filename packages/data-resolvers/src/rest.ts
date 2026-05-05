// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `RestDataResolver` — fetches a binding's data via HTTP using either:
 *
 *   1. An explicit URL template per capability id (e.g. `'github.repo.list'
 *      -> 'https://api.github.com/users/${username}/repos'`).
 *   2. A path heuristic: `${baseUrl}/${source}` where `source` is the
 *      capability id with dots replaced by slashes (e.g.
 *      `dummyjson.product.list` -> `${baseUrl}/dummyjson/product/list`).
 *
 * `filter`, `sort`, `group_by` are forwarded as query-string parameters.
 * Headers are configurable for auth (Bearer tokens, API keys, etc.).
 *
 * The resolver returns parsed JSON (`response.json()`). Non-2xx responses
 * throw with the status text so the React render walker can surface the
 * error on the component's `error` prop.
 */

import { coerceFilterToString, toQueryString } from './filter-parser.js';
import type { DataBinding } from './types.js';

/** A function that injects request headers — typically used to pull a token. */
export type HeaderProvider = (
  binding: DataBinding,
) => Record<string, string> | Promise<Record<string, string>>;

export interface RestResolverOptions {
  /**
   * Optional base URL for the fallback path heuristic. e.g.
   * `'https://dummyjson.com/'` — the resolver appends the capability id
   * as a slash-separated path.
   */
  baseUrl?: string;
  /**
   * Per-capability URL templates. The key is the capability id (matching
   * the binding's `source`); the value is either a string template with
   * `${name}` placeholders or a function that builds the URL from the
   * binding.
   *
   * String templates get binding fields substituted (`${source}`,
   * `${filter}`, `${sort}`, `${group_by}`) — useful for "swap the path
   * segment" style mappings.
   */
  urlMap?: Record<string, string | ((binding: DataBinding) => string)>;
  /**
   * Static headers for every request. Merged with `headerProvider` output;
   * the provider wins on key conflicts.
   */
  headers?: Record<string, string>;
  /** Dynamic header injector (auth tokens, request ids, etc.). */
  headerProvider?: HeaderProvider;
  /**
   * Override `fetch` (e.g. for tests). Defaults to global `fetch`.
   */
  fetch?: typeof fetch;
  /**
   * Optional response transform — e.g. to unwrap a `{ data: ... }` envelope.
   * Receives the parsed JSON; whatever it returns becomes the resolver value.
   */
  transform?: (json: unknown, binding: DataBinding) => unknown;
}

/**
 * Build a URL for the given binding. Throws if no template matches and no
 * `baseUrl` is configured.
 */
export function buildRestUrl(binding: DataBinding, options: RestResolverOptions): string {
  const tmpl = options.urlMap?.[binding.source];
  let base: string;
  if (typeof tmpl === 'function') {
    base = tmpl(binding);
  } else if (typeof tmpl === 'string') {
    base = tmpl
      .replace(/\$\{source\}/gu, binding.source)
      .replace(/\$\{filter\}/gu, encodeURIComponent(coerceFilterToString(binding.filter) ?? ''))
      .replace(/\$\{sort\}/gu, encodeURIComponent(binding.sort ?? ''))
      .replace(/\$\{group_by\}/gu, encodeURIComponent(binding.group_by ?? ''));
  } else if (options.baseUrl) {
    const trimmed = options.baseUrl.replace(/\/$/u, '');
    const path = binding.source.split('.').join('/');
    base = `${trimmed}/${path}`;
  } else {
    throw new Error(
      `RestDataResolver: no URL mapping for "${binding.source}" and no baseUrl configured`,
    );
  }

  // Append query-string params for filter/sort/group_by, merging with any
  // existing query already present on the templated URL.
  const params = toQueryString(binding);
  if (params.size === 0) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${params.toString()}`;
}

/**
 * Construct a REST `DataResolver`.
 *
 * @example
 *   const resolver = new RestDataResolver({
 *     baseUrl: 'https://dummyjson.com/',
 *     headers: { 'x-api-key': 'demo' },
 *   });
 *   const result = await resolver.resolve({ source: 'products' });
 */
export class RestDataResolver {
  readonly #options: RestResolverOptions;

  constructor(options: RestResolverOptions = {}) {
    this.#options = options;
  }

  /** Bind to the `DataResolver` protocol. */
  resolve = async (binding: DataBinding): Promise<unknown> => {
    const url = buildRestUrl(binding, this.#options);
    const fetchImpl = this.#options.fetch ?? fetch;

    const dynamic = this.#options.headerProvider ? await this.#options.headerProvider(binding) : {};
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(this.#options.headers ?? {}),
      ...dynamic,
    };

    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      throw new Error(`RestDataResolver: HTTP ${String(res.status)} for ${url}`);
    }
    const json: unknown = await res.json();
    return this.#options.transform ? this.#options.transform(json, binding) : json;
  };
}
