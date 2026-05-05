// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `GraphQLDataResolver` — auto-builds a GraphQL query from the bound
 * capability's `output` shape and POSTs it to a single configured endpoint.
 *
 * The query strategy is intentionally simple:
 *
 *   - Capability id `github.repo.list` becomes root field `githubRepoList`.
 *     Hosts can override the field name per capability via `fieldMap`.
 *   - The query returns the capability's declared output keys verbatim
 *     (filtered to scalar-looking names — anything that looks like a list
 *     of objects gets `{ id name }` as a default sub-selection so the
 *     response is shaped enough to be useful).
 *   - `filter` / `sort` / `group_by` map to the named arguments
 *     `filter`, `sort`, `groupBy` (camelCase by GraphQL convention),
 *     stringly-typed.
 *
 * Hosts that need a precise schema-aware builder should pass `queryFor`
 * with their own implementation. The default behavior is deliberately
 * shallow — the goal is "demos and small apps work with zero effort";
 * production schemas can plug in their own builders.
 */

import { astToString, coerceFilterToString, tryParseFilter } from './filter-parser.js';
import type { CapabilityLookup, DataBinding } from './types.js';
import { lookupCapability } from './types.js';

export interface GraphQLResolverOptions {
  /** Single GraphQL endpoint URL (e.g. `https://api.example.com/graphql`). */
  endpoint: string;
  /** Capability registry — used to derive output fields when auto-building. */
  capabilities?: CapabilityLookup;
  /** Override field name per capability id. */
  fieldMap?: Record<string, string>;
  /**
   * Custom query builder — receives the binding and returns the full query
   * string + variables map. Bypasses the auto-builder entirely.
   */
  queryFor?: (binding: DataBinding) => { query: string; variables?: Record<string, unknown> };
  /** Override `fetch` (e.g. for tests). */
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  headerProvider?: (
    binding: DataBinding,
  ) => Record<string, string> | Promise<Record<string, string>>;
  /** Default sub-selection for fields that look like lists of objects. */
  defaultSubSelection?: string;
}

/** Convert dotted capability ids into camelCase root field names. */
export function defaultFieldName(capabilityId: string): string {
  const parts = capabilityId.split('.');
  return parts
    .map((p, i) => (i === 0 ? p : p.length === 0 ? '' : `${p[0]!.toUpperCase()}${p.slice(1)}`))
    .join('');
}

/**
 * Heuristic: a capability `output` key whose declared type starts with
 * `array<` or contains `{` is treated as an object-list and gets a default
 * sub-selection. Everything else is selected as a scalar.
 */
function classifyOutput(output: Record<string, unknown>, defaultSub: string): string {
  const fields = Object.keys(output);
  if (fields.length === 0) return '';
  const lines = fields.map((key) => {
    const raw = output[key];
    const declared = typeof raw === 'string' ? raw : '';
    if (declared.includes('array<') || declared.includes('{')) {
      return `${key} ${defaultSub}`;
    }
    return key;
  });
  return ` { ${lines.join(' ')} }`;
}

export class GraphQLDataResolver {
  readonly #options: GraphQLResolverOptions;

  constructor(options: GraphQLResolverOptions) {
    this.#options = options;
  }

  /**
   * Build the GraphQL query (and variable bag) that will be sent for a
   * given binding. Exposed for tests; resolver consumers call `resolve`.
   */
  buildQuery(binding: DataBinding): { query: string; variables: Record<string, unknown> } {
    if (this.#options.queryFor) {
      const built = this.#options.queryFor(binding);
      return { query: built.query, variables: built.variables ?? {} };
    }
    const fieldName = this.#options.fieldMap?.[binding.source] ?? defaultFieldName(binding.source);
    const cap = this.#options.capabilities
      ? lookupCapability(this.#options.capabilities, binding.source)
      : undefined;
    const defaultSub = this.#options.defaultSubSelection ?? '{ id }';
    const selection = cap ? classifyOutput(cap.output, defaultSub) : ` ${defaultSub}`;

    const args: string[] = [];
    const variables: Record<string, unknown> = {};
    const filterStr = coerceFilterToString(binding.filter);
    if (filterStr) {
      const ast = tryParseFilter(filterStr);
      variables['filter'] = ast ? astToString(ast) : filterStr;
      args.push('filter: $filter');
    }
    if (binding.sort) {
      variables['sort'] = binding.sort;
      args.push('sort: $sort');
    }
    if (binding.group_by) {
      variables['groupBy'] = binding.group_by;
      args.push('groupBy: $groupBy');
    }

    const argList = args.length > 0 ? `(${args.join(', ')})` : '';
    const varDecls: string[] = [];
    if ('filter' in variables) varDecls.push('$filter: String');
    if ('sort' in variables) varDecls.push('$sort: String');
    if ('groupBy' in variables) varDecls.push('$groupBy: String');
    const varBlock = varDecls.length > 0 ? `(${varDecls.join(', ')})` : '';

    const query = `query Resolve${varBlock} { ${fieldName}${argList}${selection} }`;
    return { query, variables };
  }

  resolve = async (binding: DataBinding): Promise<unknown> => {
    const { query, variables } = this.buildQuery(binding);
    const fetchImpl = this.#options.fetch ?? fetch;

    const dynamic = this.#options.headerProvider ? await this.#options.headerProvider(binding) : {};
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(this.#options.headers ?? {}),
      ...dynamic,
    };

    const res = await fetchImpl(this.#options.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      throw new Error(
        `GraphQLDataResolver: HTTP ${String(res.status)} for ${this.#options.endpoint}`,
      );
    }
    const json = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown };
    if (json.errors && Array.isArray(json.errors) && json.errors.length > 0) {
      throw new Error(
        `GraphQLDataResolver: server returned errors: ${JSON.stringify(json.errors)}`,
      );
    }
    if (!json.data) return undefined;
    const fieldName = this.#options.fieldMap?.[binding.source] ?? defaultFieldName(binding.source);
    return Reflect.get(json.data, fieldName);
  };
}
