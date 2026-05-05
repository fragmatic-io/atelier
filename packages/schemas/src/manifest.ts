// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Manifest schema — the ephemeral output of compilation.
 *
 * Mirrors `/Users/vid/cir/docs/artifacts.md` §Render. A manifest is a
 * declarative interface program: cached, versioned, recomputed only on
 * trigger (ETHOS principle 5). The runtime (the "dumb" runtime, principle 7)
 * binds data to components and dispatches actions; it does not decide what
 * to show.
 *
 * Also includes:
 *  - `TurnDeltaSchema` — diff-mode output for chat turn recompiles, from
 *    `/Users/vid/cir/docs/chat/conversation-artifacts.md` §Turn deltas.
 *  - `ThreadManifestSchema` — the audit object for a chat conversation,
 *    from the same doc §The thread manifest.
 */

import { z } from 'zod';
import {
  AppId,
  CapabilityId,
  ComponentId,
  ManifestId,
  SemverString,
  SkillId,
  TenantId,
  UserId,
} from './common.js';

/**
 * Provenance block: which artifact versions produced this manifest.
 * Logged for debuggability and revert.
 *
 * `capability_version` accepts EITHER:
 *  - a single `SemverString` — the catalog snapshot version that named all
 *    capabilities at compile time (the original "snapshot" semantics), OR
 *  - a `Record<CapabilityId, SemverString>` — per-capability version map.
 *    This is what the LLM compiler tends to emit organically, because each
 *    capability has its own version and there isn't usually a single
 *    catalog snapshot version.
 *
 * Both shapes flow through cache-keying via `formatCapabilityVersion()` in
 * `@atelier/runtime/data/manifest-utils`, which serialises a record into
 * a stable canonical-JSON string (sorted by capability id) so cache keys
 * stay deterministic regardless of which shape the compiler produced.
 *
 * 2026-05-06 (post-Sprint-2 schema/LLM gap closure): also exposes the
 * record form natively as `capability_versions` (plural). New compilers
 * MAY emit either field — readers should prefer `capability_versions` if
 * present, fall back to `capability_version`. The plural form is
 * semantically primary; the singular is kept for back-compat with manifests
 * compiled before this date and for the "single catalog snapshot" use case.
 */
export const CompiledFromSchema = z.object({
  capability_version: z.union([SemverString, z.record(CapabilityId, SemverString)]),
  /**
   * Optional per-capability version map. Preferred over the legacy
   * `capability_version` field when both are present. Compilers that emit
   * one capability id → semver per active capability should populate this.
   */
  capability_versions: z.record(CapabilityId, SemverString).optional(),
  skill_versions: z.record(SkillId, SemverString),
  component_catalog_version: SemverString,
  intent_profile_version: z.number().int().nonnegative(),
  /** e.g. `claude-opus-4-7`, `claude-sonnet-4-7`, etc. */
  compiler_model: z.string().min(1),
  compiled_at: z.string(),
});
export type CompiledFrom = z.infer<typeof CompiledFromSchema>;

/**
 * Refresh policy for a single route. Free-form strings — the runtime parses
 * them. e.g. `data: "on_focus + 60s_interval"`, `structure: "never_unless_invalidated"`.
 */
export const RouteRefreshSchema = z.object({
  data: z.string().min(1),
  structure: z.string().min(1),
});
export type RouteRefresh = z.infer<typeof RouteRefreshSchema>;

/**
 * Operator vocabulary for `StructuredFilter` comparisons. Mirrors the
 * surface the LLM tends to emit when given the freedom to choose
 * (`{ field, op, value }` objects) and the surface that round-trips
 * cleanly to a CEL-like expression string via `formatFilterAsString` in
 * `@atelier/runtime/data/filter-utils`.
 *
 * Keep additions deliberate — every new op needs both a CEL emitter and
 * a JS predicate in the runtime helper, plus matching guidance in the
 * compiler prompt.
 */
export type StructuredFilterOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'contains'
  | 'in'
  | 'nin';

/**
 * Structured filter object for `ComponentDataBinding.filter`.
 *
 * Sprint 2.4 / P3 — widening the LLM compile contract. The compiler
 * prompt encourages CEL-like strings ("`status == 'pending'`") for
 * simple comparisons, but real LLM output often emits an equivalent
 * structured object (`{ field: 'status', op: 'eq', value: 'pending' }`).
 * Both forms now validate; consumers convert via `formatFilterAsString`
 * (CEL string) or `applyFilter` (in-memory predicate).
 *
 * `and` / `or` allow conjunctions/disjunctions without escaping into a
 * raw expression string — `{ and: [{...}, {...}] }`.
 */
export interface StructuredFilter {
  field: string;
  op: StructuredFilterOp;
  /**
   * Comparison value. `unknown` because the LLM may emit any JSON
   * literal here (string, number, boolean, array for `in` / `nin`,
   * object for nested capability references). Optional in the wire
   * shape because Zod's `z.unknown()` infers it that way; consumers
   * should treat `undefined` as "compare against undefined" or skip.
   */
  value?: unknown;
  and?: StructuredFilter[] | undefined;
  or?: StructuredFilter[] | undefined;
}

/**
 * Direction enum for `StructuredSortKey`. Mirrors the SQL / RFC9457 surface
 * the LLM already understands; keep additions deliberate.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Single sort key inside a `StructuredSort`.
 *
 * 2026-05-06 — captured during the post-Sprint-2 schema/LLM gap closure:
 * the LLM organically emits `[{ field: 'created_at', direction: 'desc' }, ...]`
 * for multi-field ordering, even when prompted toward simpler shapes,
 * because that's what the underlying data API takes. Both forms now
 * validate; consumers convert via `formatSortAsString` (CEL-ish string)
 * or `applySort` (in-memory comparator) in
 * `@atelier/runtime/data/filter-utils`.
 */
export interface StructuredSortKey {
  field: string;
  direction?: SortDirection | undefined;
}

/**
 * Structured sort surface for `ComponentDataBinding.sort`.
 *
 * The compiler prompt encourages CEL-like strings ("`-created_at, +id`")
 * for simple ordering, but the LLM tends to emit an array of structured
 * keys for multi-field sorts. Both validate; the runtime
 * `formatSortAsString()` round-trips the structured form to a stable
 * string for cache keys.
 */
export type StructuredSort = StructuredSortKey[];

/**
 * Zod schema for a single `StructuredSortKey`.
 */
export const StructuredSortKeySchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']).optional(),
});

/**
 * Zod schema for `StructuredSort` — a non-empty array of `StructuredSortKey`s.
 * Empty array is rejected because an empty sort is semantically a no-op
 * and almost always indicates LLM confusion.
 */
export const StructuredSortSchema: z.ZodType<StructuredSort> = z
  .array(StructuredSortKeySchema)
  .min(1);

/**
 * Data binding for a single component instance.
 *
 * `source` is the capability ID (or a logical data source name); `filter`,
 * `sort`, `group_by` are query-language strings the runtime evaluates against
 * the bound data source.
 *
 * `filter` accepts either a CEL-like expression string (preferred for
 * simple comparisons — `status == 'pending'`) or a structured
 * `StructuredFilter` object. See `StructuredFilter` and the
 * `formatFilterAsString` / `applyFilter` helpers in
 * `@atelier/runtime/data/filter-utils` for the round-trip contract.
 *
 * `empty_state`, `loading_state`, `error_state` (Wave 7a / P-8) — slots that
 * declare which `LayoutNode` to render when the bound data source is empty,
 * loading, or errored. These are the manifest-level expression of the policy
 * `empty_loading_error_handled`. Slots are full `LayoutNode`s so they can be
 * arbitrary subtrees (a styled `EmptyState`, a `Stack` wrapping a `Spinner`,
 * etc.). They appear on the binding (rather than as ad-hoc props) so the
 * policy walker can locate them without component-specific knowledge.
 */
export interface ComponentDataBinding {
  source: string;
  filter?: string | StructuredFilter | undefined;
  /**
   * 2026-05-06 widened — accepts either a CEL-ish ordering string
   * (`"-created_at, +id"`) or a `StructuredSort` array
   * (`[{ field: 'created_at', direction: 'desc' }, ...]`). The LLM
   * tends to emit the structured form for multi-field sorts. The
   * runtime `formatSortAsString` / `applySort` helpers handle both.
   */
  sort?: string | StructuredSort | undefined;
  group_by?: string | undefined;
  empty_state?: LayoutNode | undefined;
  loading_state?: LayoutNode | undefined;
  error_state?: LayoutNode | undefined;
  /**
   * Wave 10 / S-2 — inline cardinality hint for this binding. When set,
   * overrides the bound capability's `expected_count` for policy purposes
   * (e.g. the long-list / virtualization advisory). Useful when the
   * manifest knows the binding is filtered to a small subset of a
   * naturally-large capability.
   */
  expected_count?: number | undefined;
}

/**
 * Recursive layout node. A node is one component instance with optional
 * data binding, action set, and child nodes.
 *
 * Recursion is expressed via `z.lazy()` because Zod cannot infer the type
 * for a self-referencing schema directly. `LayoutNodeSchema` and
 * `ComponentDataBindingSchema` are mutually recursive — a binding's
 * `empty_state` / `loading_state` / `error_state` slots are themselves
 * `LayoutNode`s — so both schemas are wrapped in `z.lazy(...)`.
 *
 * `row_binding` (Phase 2 #3) — a component-id reference resolved against
 * the runtime registry at render time. When set on a data-bound node
 * (`<List>`, `<Grid>`, `<Table>`, or any custom binding declaring
 * `compositionRole: 'list' | 'grid' | 'table'`), the renderer threads the
 * resolved factory as the `renderItem` prop, with each row item passed as
 * `props.data` to the row factory. This replaces the wrapper-tax pattern
 * (`<ProductGrid>` hardcoding `<ProductCard>` as its row) — manifests can
 * now say `<Grid row_binding="ProductCard" data={{ source: '...' }}>`
 * directly.
 */
export interface LayoutNode {
  component: string; // ComponentId at runtime
  data?: ComponentDataBinding | undefined;
  actions?: string[] | undefined; // CapabilityId[]
  children?: LayoutNode[] | undefined;
  /** Free-form prop bag. The component's `props_schema` is the type-level contract. */
  props?: Record<string, unknown> | undefined;
  /**
   * Component id of a row factory used by data-bound collection components.
   * Resolved against the runtime registry by the adapter and threaded as
   * `renderItem`. The row factory receives the row item as `props.data`.
   */
  row_binding?: string | undefined;
}

/**
 * Structured filter validator. Self-recursive via `z.lazy()` because
 * `and` / `or` nest the same shape. The `StructuredFilterOpSchema` enum
 * is held public so downstream tools (auto-fixers, doc generators) can
 * introspect the supported op vocabulary without re-deriving it.
 */
export const StructuredFilterOpSchema = z.enum([
  'eq',
  'ne',
  'gt',
  'lt',
  'gte',
  'lte',
  'contains',
  'in',
  'nin',
]);

export const StructuredFilterSchema: z.ZodType<StructuredFilter> = z.lazy(() =>
  z.object({
    field: z.string().min(1),
    op: StructuredFilterOpSchema,
    value: z.unknown(),
    and: z.array(StructuredFilterSchema).optional(),
    or: z.array(StructuredFilterSchema).optional(),
  }),
);

export const ComponentDataBindingSchema: z.ZodType<ComponentDataBinding> = z.lazy(() =>
  z.object({
    source: z.string().min(1),
    // Sprint 2.4 / P3 — widened to accept either a CEL-like expression
    // string or a structured `{ field, op, value, and?, or? }` object.
    // See `StructuredFilter` for the rationale.
    filter: z.union([z.string(), StructuredFilterSchema]).optional(),
    // 2026-05-06 — widened to accept either a string (CEL-ish ordering
    // expression) or a structured `StructuredSort` array. Same rationale
    // as the `filter` widening; see `StructuredSort`.
    sort: z.union([z.string(), StructuredSortSchema]).optional(),
    group_by: z.string().optional(),
    empty_state: LayoutNodeSchema.optional(),
    loading_state: LayoutNodeSchema.optional(),
    error_state: LayoutNodeSchema.optional(),
    // Wave 10 / S-2 — inline cardinality hint (see interface comment).
    expected_count: z.number().int().min(0).optional(),
  }),
);

export const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.object({
    component: ComponentId,
    data: ComponentDataBindingSchema.optional(),
    actions: z.array(CapabilityId).optional(),
    children: z.array(LayoutNodeSchema).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    row_binding: ComponentId.optional(),
  }),
);

/**
 * One route in the manifest.
 *
 * Routes are either a redirect or a layout. A few routes have neither (e.g.
 * a placeholder during compilation) — both are optional, and the policy
 * engine catches the "neither set" case at validation time.
 */
export const RouteSchema = z.object({
  path: z.string().min(1),
  redirect: z.string().optional(),
  title: z.string().optional(),
  layout: LayoutNodeSchema.optional(),
  refresh: RouteRefreshSchema.optional(),
});
export type Route = z.infer<typeof RouteSchema>;

/**
 * The full manifest.
 *
 * `ttl`: nullable — `null` means "no time-based expiry, only invalidate on
 *   triggers". A finite number is seconds-from-compile_at.
 * `invalidates_on`: free-form trigger expressions — see
 *   `/Users/vid/cir/docs/caching.md` for the matrix of trigger to invalidation.
 */
export const ManifestSchema = z.object({
  manifest_id: ManifestId,
  user_id: UserId,
  app_id: AppId,
  /**
   * Optional tenant scope. When set, manifest cache and Tier-3 store key by
   * `(tenant_id, manifest_id)` instead of `manifest_id` alone, preventing
   * cross-tenant cache leaks. Single-tenant deployments leave this unset
   * (treated as `'default'` downstream). See `docs/production-concerns.md`
   * §"Multi-tenant safety".
   */
  tenant_id: TenantId.optional(),
  compiled_from: CompiledFromSchema,
  ttl: z.number().nullable().optional(),
  invalidates_on: z.array(z.string()),
  routes: z.array(RouteSchema),
  policies_satisfied: z.array(z.string()),
  rollback_to: ManifestId.optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// -----------------------------------------------------------------------------
// Chat: turn delta and thread manifest
// -----------------------------------------------------------------------------

/**
 * One change operation inside a turn delta. The doc gives free-form
 * examples (`add_route`, `update_data_source`, ...) so we accept any
 * `op` string and a free-form payload.
 */
export const TurnDeltaChangeSchema = z
  .object({
    op: z.string().min(1),
  })
  .catchall(z.unknown());
export type TurnDeltaChange = z.infer<typeof TurnDeltaChangeSchema>;

export const TurnDeltaSchema = z.object({
  delta_type: z.enum(['extend', 'modify', 'replace']),
  previous_manifest: ManifestId,
  new_manifest: ManifestId,
  changes: z.array(TurnDeltaChangeSchema),
  tokens_used: z.number().int().nonnegative(),
  model: z.string().min(1),
});
export type TurnDelta = z.infer<typeof TurnDeltaSchema>;

/**
 * One step in a thread manifest — a turn that produced a manifest.
 */
export const ThreadStepSchema = z.object({
  turn: z.number().int().nonnegative(),
  manifest_id: ManifestId,
  rendered_components: z.array(ComponentId),
});
export type ThreadStep = z.infer<typeof ThreadStepSchema>;

/**
 * Audit object for a chat conversation — the manifest "thread" produced
 * across all turns. Used by security review and billing.
 */
export const ThreadManifestSchema = z.object({
  conversation_id: z.string().min(1),
  thread: z.array(ThreadStepSchema),
  total_tokens: z.number().int().nonnegative(),
  total_actions_executed: z.number().int().nonnegative(),
});
export type ThreadManifest = z.infer<typeof ThreadManifestSchema>;
