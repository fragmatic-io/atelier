// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Cnt-10 — Saved view definition.
 *
 * Linear's "Active issues", Airtable's grid/kanban/calendar/gallery views,
 * Stripe's saved searches all share the same shape: a named bundle of
 * (display, filters, sort, group_by, density) the user pins to a surface
 * and hands around as a shareable URL.
 *
 * Atelier ships:
 *  - `ViewDefinition` (this file) — the data shape, persisted as part of
 *    the user's `IntentProfile.saved_views`.
 *  - `serializeView` / `parseView` — `@atelier/components/views/url`
 *    URL-shareable serializer (mirrors `serializeTrail` / `parseTrail`
 *    from Wave 11 / Nav-4).
 *  - `useSavedView()` — `@atelier/react` stateful hook that resolves an
 *    active view, activates by id, saves new ones, and (opt-in) keeps the
 *    selection in sync with `?_view=…` on the URL.
 *
 * Why a SCHEMA (not just a TS type)?
 * ----------------------------------
 * Saved views round-trip through the vault and the marketplace bundle
 * envelope (`SignedBundleSchema`). Anything that crosses that wire needs
 * runtime validation — the type alias alone would let a malformed import
 * silently corrupt a user's profile. `IntentProfileSchema.parse(blob)`
 * MUST reject a bad `saved_views` entry the same way it rejects a bad
 * `priority_rule`.
 *
 * Filter operator set
 * -------------------
 * The six operators (`eq`, `ne`, `in`, `gt`, `lt`, `contains`) cover the
 * 95th-percentile of saved-view predicates Linear / Airtable / Stripe
 * ship today. Bigger expressions (boolean groups, `between`, regex) are
 * out of scope — capability authors who need richer filtering pass a
 * compiled predicate through their own resolver and reach for
 * `view.filters` only as a UI hint.
 *
 * Display vs. source
 * ------------------
 * `display` is the visual shape (what the user sees: list / kanban /
 * calendar / grid / gallery). `source` is the capability id the view
 * binds to (e.g. `'github.issue.list'`). They are decoupled so a single
 * capability can power multiple views (Linear's "All issues" + "Active"
 * + "My triage" all bind to `linear.issue.list`) and a single display
 * shape can render many capabilities.
 */

import { z } from 'zod';
import { DensityPreference } from './intent.js';

/**
 * Predicate operator set saved views support. See module docs for the
 * design boundary — anything richer is the host's resolver to compute.
 */
export const ViewFilterOpSchema = z.enum(['eq', 'ne', 'in', 'gt', 'lt', 'contains']);
export type ViewFilterOp = z.infer<typeof ViewFilterOpSchema>;

/**
 * One filter clause. `value` is `unknown` because the wire is heterogeneous
 * — a status filter compares strings, a date filter ISO timestamps, a
 * tag filter an array. Hosts narrow with their capability's input schema.
 */
export const ViewFilterSchema = z.object({
  field: z.string().min(1),
  op: ViewFilterOpSchema,
  value: z.unknown(),
});
export type ViewFilter = z.infer<typeof ViewFilterSchema>;

/**
 * Sort spec. Single-key (matches the saved-view UIs Linear / Airtable
 * ship today — multi-key sort is a power-user surface that lives in the
 * column-header UI, not the view definition).
 */
export const ViewSortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});
export type ViewSort = z.infer<typeof ViewSortSchema>;

/**
 * Display shape enum. `gallery` sits alongside `grid` to mirror
 * Airtable's distinction (grid = tabular w/ row chrome; gallery =
 * card-tile shape) — the two render very differently and saved views
 * pick exactly one.
 */
export const ViewDisplaySchema = z.enum(['list', 'kanban', 'calendar', 'grid', 'gallery']);
export type ViewDisplay = z.infer<typeof ViewDisplaySchema>;

/**
 * The full saved-view shape. `id` is the host-stable handle (used as the
 * URL `?_view=` value when sync is on); `label` is what the chrome
 * renders.
 */
export const ViewDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Visual shape. */
  display: ViewDisplaySchema,
  /** Capability id (e.g. `'github.issue.list'`). */
  source: z.string().min(1),
  filters: z.array(ViewFilterSchema).optional(),
  sort: ViewSortSchema.optional(),
  group_by: z.string().min(1).optional(),
  density: DensityPreference.optional(),
});
export type ViewDefinition = z.infer<typeof ViewDefinitionSchema>;
