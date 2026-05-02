// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `<CirRoute path={...}>` — top-level route component.
 *
 * Behavior:
 *  - Resolves the manifest for `path` via `useManifest`.
 *  - While loading: renders `fallback` (default: `<>Loading...</>`).
 *  - On error: renders `errorFallback(err)` (default: a non-styled message).
 *  - On success: builds a `RenderPlan` via `buildRenderPlan(manifest, path,
 *    services.registry)` and renders `<RenderNode node={plan.root} />`.
 *  - Wraps the success branch in `<CirErrorBoundary>` so render-time errors
 *    in bound components also trigger `errorFallback`. Reset key is the
 *    manifest_id so a refresh recovers cleanly.
 *  - Subscribes to triggers via `wireTriggerInvalidation` semantics and
 *    auto-`refresh()`es when this route's manifest is evicted from cache.
 *    We do this by attaching a wildcard listener on the bus and detecting
 *    eviction by re-checking the cache (which the resolver hits) — but
 *    practically, the simpler thing is to listen for trigger types relevant
 *    to this app/user/route and call `refresh()` on a match.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import { buildRenderPlan, RouteNotFoundError, RouteNotRenderableError } from '@atelier/runtime';
import type { Trigger } from '@atelier/schemas';
import { resolveDensity } from '@atelier/components/density-resolver';
import { useCir } from '../hooks/use-cir.js';
import { useManifest } from '../hooks/use-resolver.js';
import { useTrigger } from '../hooks/use-trigger.js';
import { CirErrorBoundary } from '../error-boundary.js';
import { CurrentManifestContext } from '../context/manifest-context.js';
import { RenderNode } from './render-node.js';

/**
 * One-shot effect: when an intent profile carries `color_mode`, mirror it
 * onto `<html data-color-mode>`. Rather than per-component theme props, this
 * gives a single defaulting site the host's stylesheet can key off (e.g.
 * `html[data-color-mode='dark'] { ... }`). Hosts that want to ignore the
 * preference can simply not provide an `intent` on the services bag.
 */
function useColorModeFromIntent(colorMode: string | undefined): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (colorMode === 'light' || colorMode === 'dark' || colorMode === 'system') {
      root.dataset['colorMode'] = colorMode;
    }
    // Intentionally NOT clearing on unmount: we don't want the route swap to
    // momentarily flash an unset color mode. The next route that mounts will
    // re-set it.
  }, [colorMode]);
}

export interface CirRouteProps {
  path: string;
  /** Rendered while the manifest is loading. */
  fallback?: ReactNode;
  /** Rendered if resolution fails. */
  errorFallback?: (error: Error) => ReactNode;
}

const defaultFallback: ReactNode = <>Loading...</>;
const defaultErrorFallback = (err: Error): ReactNode => (
  <div data-cir-error="">Error: {err.message}</div>
);

/**
 * Returns true when the given trigger should evict the cached manifest for
 * `(user_id, app_id, route)` per `wireTriggerInvalidation`'s rules. We
 * mirror that logic here rather than coupling tightly to the helper, so the
 * route refreshes consistently regardless of whether the host wired
 * invalidation up.
 */
function affectsRoute(t: Trigger, user_id: string, app_id: string, route: string): boolean {
  switch (t.type) {
    case 'capability.added':
    case 'capability.changed':
    case 'capability.removed':
    case 'capability.version_bumped':
    case 'component.added':
    case 'component.changed':
    case 'component.removed':
    case 'component.version_bumped':
    case 'skill.added':
    case 'skill.changed':
    case 'skill.removed':
    case 'skill.version_bumped':
    case 'policy.changed':
      return 'app_id' in t && t.app_id === app_id;
    case 'intent.preference_changed':
    case 'intent.lens_switched':
    case 'intent.rule_added':
    case 'intent.rule_removed':
    case 'intent.rule_modified':
    case 'intent.vocabulary_updated':
    case 'user.recompile_all':
    case 'user.try_lens':
      return 'user_id' in t && t.user_id === user_id;
    case 'user.recompile_route':
      return t.user_id === user_id && t.route === route;
    default:
      return false;
  }
}

export function CirRoute(props: CirRouteProps): React.ReactElement {
  const { path } = props;
  const fallback = props.fallback ?? defaultFallback;
  const errorFallback = props.errorFallback ?? defaultErrorFallback;
  const services = useCir();
  const { manifest, isLoading, error, refresh } = useManifest(path);

  // Reflect the user's color_mode preference onto <html>. One defaulting site,
  // not per-component, mirrors how `density` is per-component but `color_mode`
  // is a global theme switch.
  const colorModePref = services.intent?.global_preferences['color_mode'];
  useColorModeFromIntent(typeof colorModePref === 'string' ? colorModePref : undefined);

  // Auto-refresh on triggers that would evict THIS route's manifest.
  useTrigger('*', (event) => {
    if (affectsRoute(event, services.identity.user_id, services.identity.app_id, path)) {
      void refresh();
    }
  });

  // Building the plan is cheap; rebuild on every render once we have a manifest.
  // Returns either a `RenderPlan`, an `Error` (surfaced via errorFallback), or
  // `null` when we are mid-transition (path changed, manifest still stale).
  const plan = useMemo(() => {
    if (!manifest) return null;
    try {
      return buildRenderPlan(manifest, path, services.registry);
    } catch (err) {
      if (err instanceof RouteNotFoundError) {
        // Stale manifest from a previous path — wait for the new fetch.
        return null;
      }
      if (err instanceof RouteNotRenderableError) {
        // Surface as an error to the caller via errorFallback.
        return err;
      }
      throw err;
    }
  }, [manifest, path, services.registry]);

  // Re-fetch when path changes — already handled by useManifest's deps.
  // useEffect placeholder for future side effects (eg focus refresh).
  useEffect(() => {
    // intentionally empty: path-change fetch is in useManifest.
  }, [path]);

  if (isLoading && !manifest) return <>{fallback}</>;
  if (error) return <>{errorFallback(error)}</>;
  if (!manifest) return <>{fallback}</>;
  if (plan instanceof Error) return <>{errorFallback(plan)}</>;
  if (!plan) return <>{fallback}</>;

  // Wave 11 / Vis-6 — emit `data-cir-density` on the route's outermost
  // wrapper so the host's `globals.css` can resolve `--atelier-density-*`
  // CSS variables to the right tier per-route. The wrapper is a plain
  // `<div>` carrying only `display: contents` so it does not introduce a
  // layout box but is a real DOM element CSS can attach to. The route walker
  // also threads the `path` prop into `<RenderNode>` so per-component
  // `density` defaulting honours `density_overrides`.
  const effectiveDensity = resolveDensity(services.intent, path);

  return (
    <CurrentManifestContext.Provider value={{ manifest_id: manifest.manifest_id, route: path }}>
      <div
        data-cir-route={path}
        data-cir-density={effectiveDensity}
        style={{ display: 'contents' }}
      >
        <CirErrorBoundary
          fallback={errorFallback}
          resetKey={manifest.manifest_id}
          audit={services.audit}
          user_id={services.identity.user_id}
          app_id={services.identity.app_id}
        >
          <RenderNode node={plan.root} route={path} />
        </CirErrorBoundary>
      </div>
    </CurrentManifestContext.Provider>
  );
}
