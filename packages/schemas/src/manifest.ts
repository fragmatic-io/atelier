// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
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
 */
export const CompiledFromSchema = z.object({
  capability_version: SemverString,
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
 * Data binding for a single component instance.
 *
 * `source` is the capability ID (or a logical data source name); `filter`,
 * `sort`, `group_by` are query-language strings the runtime evaluates against
 * the bound data source.
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
  filter?: string | undefined;
  sort?: string | undefined;
  group_by?: string | undefined;
  empty_state?: LayoutNode | undefined;
  loading_state?: LayoutNode | undefined;
  error_state?: LayoutNode | undefined;
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
 */
export interface LayoutNode {
  component: string; // ComponentId at runtime
  data?: ComponentDataBinding | undefined;
  actions?: string[] | undefined; // CapabilityId[]
  children?: LayoutNode[] | undefined;
  /** Free-form prop bag. The component's `props_schema` is the type-level contract. */
  props?: Record<string, unknown> | undefined;
}

export const ComponentDataBindingSchema: z.ZodType<ComponentDataBinding> = z.lazy(() =>
  z.object({
    source: z.string().min(1),
    filter: z.string().optional(),
    sort: z.string().optional(),
    group_by: z.string().optional(),
    empty_state: LayoutNodeSchema.optional(),
    loading_state: LayoutNodeSchema.optional(),
    error_state: LayoutNodeSchema.optional(),
  }),
);

export const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.object({
    component: ComponentId,
    data: ComponentDataBindingSchema.optional(),
    actions: z.array(CapabilityId).optional(),
    children: z.array(LayoutNodeSchema).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
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
