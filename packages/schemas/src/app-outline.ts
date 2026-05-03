// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * App outline — the once-per-app pre-pass output that per-route compiles
 * inherit. Wave C / Phase C-4.
 *
 * The outline carries:
 *  - `chrome` — the brand-chrome `LayoutNode` that wraps every route. Today
 *    the deterministic baseline emits `Stack(Logo, NavBar, StatusBar)`. Per-
 *    route compiles render only their content area; the host shell wraps
 *    the route layout inside the chrome at render time.
 *  - `nav` — cross-route navigation entries (route id + label, ordered) the
 *    chrome's `<NavBar>` consumes. Sorted by `order` so deterministic.
 *  - `commonPolicies` — policy ids every route is expected to satisfy. The
 *    deterministic compiler computes the intersection across all routes'
 *    declared policy lists; a route may declare extras locally.
 *  - `skillStack` — skills installed app-wide. The deterministic compiler
 *    computes the union of skills referenced by all routes (deduped + sorted)
 *    so per-route compiles can assume every listed skill is in scope.
 *  - `brandKitId` — the brand kit the chrome was generated against. Threaded
 *    so per-route compiles can verify they're inheriting a chrome from the
 *    same brand kit they're compiling under.
 *
 * The schema lives in `@atelier/schemas` (alongside `Manifest`) so the
 * compiler, runtime, and any host-side coherence tooling share one
 * definition. The actual outline-compiler lives in `@atelier/compiler`.
 *
 * See `/Users/vid/cir/docs/build-plan.md` §"Phase C-4 — outline agent for
 * multi-route apps" for the design motivation: cross-route chrome / brand
 * drift in V-6 marketplace apps is what this pass exists to eliminate.
 */

import { z } from 'zod';
import { LayoutNodeSchema } from './manifest.js';

/**
 * One entry in the app-wide nav list. The chrome's `<NavBar>` reads these
 * — the route id resolves to a path the host's router knows, the label is
 * what the user sees, and `order` is the sort key the deterministic
 * compiler uses (ties broken by `routeId` lexicographically for stability).
 */
export const NavEntrySchema = z.object({
  routeId: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().min(1).optional(),
  order: z.number().int().nonnegative(),
});
export type NavEntry = z.infer<typeof NavEntrySchema>;

/**
 * The full app outline. See module docstring for field-level semantics.
 */
export const AppOutlineSchema = z.object({
  /** The chrome layout that wraps every route — typically `Stack(Logo, NavBar, StatusBar, …)`. */
  chrome: LayoutNodeSchema,
  /** Cross-route nav structure. Sorted by `order` for deterministic rendering. */
  nav: z.array(NavEntrySchema),
  /** Policies that apply to every route — intersection of per-route declarations. */
  commonPolicies: z.array(z.string().min(1)),
  /** Skills installed app-wide — union of per-route skill references (deduped + sorted). */
  skillStack: z.array(z.string().min(1)),
  /** Brand kit identifier the chrome was generated against. */
  brandKitId: z.string().min(1),
});
export type AppOutline = z.infer<typeof AppOutlineSchema>;
