// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `OpenApiDataResolver` — resolves a binding by looking up its capability's
 * `_review.imported_from` field (set by `cir import openapi`) and the
 * matching operation in the original OpenAPI spec.
 *
 * Convention from `packages/cli/src/commands/import-openapi.ts`:
 *
 *   _review.imported_from = `openapi:${parsed.spec}`;
 *
 * That spec ref points us at a JSON document — either a remote URL or a
 * filesystem path. To keep this package framework- and runtime-agnostic
 * the host wires a `specLoader` that fetches the spec by reference. We
 * cache loaded specs in-process so a second resolver call doesn't refetch.
 *
 * The matching strategy:
 *   - If a per-capability `operationMap` is provided, prefer it.
 *   - Otherwise scan the spec's `paths` for an operation whose
 *     `operationId` matches the capability id (with dots converted to
 *     underscores or kept literal).
 *   - Choose the first GET (data capabilities are typically GETs).
 *
 * Once an operation is located the resolver builds an absolute URL from
 * the spec's `servers[0].url` (or a host-supplied default) and delegates
 * to `RestDataResolver` for the actual fetch — that gives us auth header
 * injection, query-string mapping, and response transforms for free.
 */

import { RestDataResolver, type RestResolverOptions } from './rest.js';
import type { CapabilityLookup, DataBinding } from './types.js';
import { lookupCapability } from './types.js';

interface OpenApiOperation {
  operationId?: string;
  parameters?: unknown[];
  responses?: unknown;
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
}

interface OpenApiSpec {
  servers?: { url: string }[];
  paths?: Record<string, OpenApiPathItem>;
}

export type SpecLoader = (ref: string) => Promise<OpenApiSpec> | OpenApiSpec;

export interface OpenApiResolverOptions {
  capabilities: CapabilityLookup;
  /**
   * Loader for OpenAPI specs by reference. The reference is the
   * `imported_from` value with the `openapi:` prefix stripped.
   */
  specLoader: SpecLoader;
  /**
   * Per-capability operation override. Map of `capabilityId -> { method,
   * path }`. Useful when `operationId` doesn't match the capability id.
   */
  operationMap?: Record<string, { method: string; path: string }>;
  /** Override `fetch` (passed through to the inner REST resolver). */
  fetch?: typeof fetch;
  /** Static + dynamic headers for the actual HTTP fetch. */
  headers?: Record<string, string>;
  headerProvider?: RestResolverOptions['headerProvider'];
  /** Fallback base URL when the spec has no `servers` entry. */
  defaultBaseUrl?: string;
  /** Response transform forwarded to the inner REST resolver. */
  transform?: RestResolverOptions['transform'];
}

interface OperationMatch {
  method: string;
  path: string;
  baseUrl: string;
}

/** Strip the `openapi:` prefix the importer stamps onto `imported_from`. */
export function specRefFromImportedFrom(importedFrom: string): string {
  if (importedFrom.startsWith('openapi:')) return importedFrom.slice('openapi:'.length);
  return importedFrom;
}

/**
 * Find the operation matching `capabilityId` inside an OpenAPI spec. Match
 * order:
 *   1. `operationId === capabilityId`.
 *   2. `operationId === capabilityId.replace(/\./g, '_')`.
 *   3. First GET on the path that mentions the capability's last segment.
 */
export function findOperation(
  spec: OpenApiSpec,
  capabilityId: string,
): { method: string; path: string } | undefined {
  const paths = spec.paths ?? {};
  const aliases = new Set([capabilityId, capabilityId.replace(/\./gu, '_')]);
  for (const [path, item] of Object.entries(paths)) {
    if (!item) continue;
    for (const [method, op] of Object.entries(item) as [string, OpenApiOperation | undefined][]) {
      if (!op || typeof op !== 'object') continue;
      if (op.operationId && aliases.has(op.operationId)) {
        return { method, path };
      }
    }
  }
  // Heuristic fallback: capability "ns.repo.list" -> any GET with `repo` and `list` in its path.
  const segments = capabilityId.split('.');
  const last = segments[segments.length - 1];
  for (const [path, item] of Object.entries(paths)) {
    if (!item?.get) continue;
    if (last && path.toLowerCase().includes(last.toLowerCase())) {
      return { method: 'get', path };
    }
  }
  return undefined;
}

export class OpenApiDataResolver {
  readonly #options: OpenApiResolverOptions;
  readonly #specCache = new Map<string, Promise<OpenApiSpec>>();

  constructor(options: OpenApiResolverOptions) {
    this.#options = options;
  }

  resolve = async (binding: DataBinding): Promise<unknown> => {
    const match = await this.#locate(binding);
    const tmpl = this.#substitutePathParams(match.path, binding);

    // Hand off to the REST resolver with a single-shot urlMap entry.
    const inner = new RestDataResolver({
      urlMap: {
        [binding.source]: () => `${match.baseUrl.replace(/\/$/u, '')}${tmpl}`,
      },
      ...(this.#options.fetch !== undefined ? { fetch: this.#options.fetch } : {}),
      ...(this.#options.headers !== undefined ? { headers: this.#options.headers } : {}),
      ...(this.#options.headerProvider !== undefined
        ? { headerProvider: this.#options.headerProvider }
        : {}),
      ...(this.#options.transform !== undefined ? { transform: this.#options.transform } : {}),
    });
    return inner.resolve(binding);
  };

  async #locate(binding: DataBinding): Promise<OperationMatch> {
    const cap = lookupCapability(this.#options.capabilities, binding.source);
    if (!cap) {
      throw new Error(`OpenApiDataResolver: no capability registered for "${binding.source}"`);
    }
    const importedFrom = cap._review?.imported_from;
    if (!importedFrom) {
      throw new Error(
        `OpenApiDataResolver: capability "${binding.source}" has no _review.imported_from`,
      );
    }
    const ref = specRefFromImportedFrom(importedFrom);
    const spec = await this.#loadSpec(ref);

    const override = this.#options.operationMap?.[binding.source];
    const op = override ?? findOperation(spec, binding.source);
    if (!op) {
      throw new Error(
        `OpenApiDataResolver: no matching operation for "${binding.source}" in ${ref}`,
      );
    }

    const baseUrl = spec.servers?.[0]?.url ?? this.#options.defaultBaseUrl;
    if (!baseUrl) {
      throw new Error(
        `OpenApiDataResolver: spec ${ref} has no servers[0].url and no defaultBaseUrl`,
      );
    }
    return { method: op.method, path: op.path, baseUrl };
  }

  async #loadSpec(ref: string): Promise<OpenApiSpec> {
    const cached = this.#specCache.get(ref);
    if (cached) return cached;
    const promise = Promise.resolve(this.#options.specLoader(ref));
    this.#specCache.set(ref, promise);
    try {
      return await promise;
    } catch (err) {
      this.#specCache.delete(ref);
      throw err;
    }
  }

  #substitutePathParams(path: string, binding: DataBinding): string {
    // For now we substitute `{name}` segments from any `props` / `filter`-like
    // hook the host might have stored. A full solution requires access to the
    // bound input; the manifest doesn't carry that today. We replace any
    // unresolved placeholders with the binding source's last segment so the
    // URL is still well-formed for sample/demo specs.
    return path.replace(/\{(\w+)\}/gu, (_match, name: string) => {
      const fromBinding = (binding as unknown as Record<string, string | undefined>)[name];
      if (typeof fromBinding === 'string' && fromBinding.length > 0) return fromBinding;
      return name;
    });
  }
}
