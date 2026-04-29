// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Trigger -> cache invalidation wiring.
 *
 * Subscribes to schema/policy/intent triggers on a given bus and evicts
 * matching entries from a `ManifestCache`. See the trigger -> invalidation
 * matrix in `/Users/vid/cir/docs/caching.md` §"What invalidates what".
 *
 * Eviction policy in this Phase 4a wiring:
 *  - Schema triggers (`capability.*`, `component.*`, `skill.*`,
 *    `policy.changed`): evict every cached manifest for the affected
 *    `app_id`. (We can't tell from the trigger alone WHICH manifests
 *    referenced the artifact, so we conservatively flush per-app.)
 *  - Intent triggers (`intent.*`): evict every cached manifest for the
 *    affected `user_id`.
 *  - Explicit user triggers (`user.recompile_route`,
 *    `user.recompile_all`, `user.revert_manifest`): evict per the trigger
 *    payload. `user.try_lens` evicts everything for the user as well.
 *  - Other triggers (behavioral, system, chat): not handled here. Hosts that
 *    want to react to those should subscribe directly.
 *
 * Returns an `Unsubscribe` that clears every subscription this helper made.
 */

import type { ManifestCache, ManifestCacheKey } from '../manifest/cache.js';
import type { Unsubscribe } from '../types.js';
import type { TriggerSubscription } from './subscription.js';

export interface WireTriggerInvalidationOptions {
  bus: TriggerSubscription;
  cache: ManifestCache;
  /**
   * Optional hook called with the number of entries removed (or marked
   * stale, when `markStaleInsteadOfEvict` is true) per trigger.
   */
  onEvict?: (triggerType: string, removed: number) => void;
  /**
   * When `true`, the wiring marks matching cache entries as `stale` instead
   * of deleting them. Pair with `new ManifestResolver({ staleWhileRevalidate:
   * true })` to keep serving the prior manifest while a fresh one compiles
   * in the background. Default `false` (legacy behavior: evict).
   *
   * See `/Users/vid/cir/docs/caching.md` §"Semantic invalidation" — schema
   * changes that don't change the manifest *shape* (e.g. a tweaked skill
   * description) are ideal candidates for stale-marking, since the existing
   * manifest is still safe to render.
   */
  markStaleInsteadOfEvict?: boolean;
}

export function wireTriggerInvalidation(opts: WireTriggerInvalidationOptions): Unsubscribe {
  const { bus, cache, onEvict, markStaleInsteadOfEvict } = opts;
  const unsubs: Unsubscribe[] = [];

  // Single dispatch: either evict or mark stale, depending on the option.
  // The two paths share the same predicate so callers can flip the flag
  // without changing trigger handlers.
  const apply = async (
    type: string,
    predicate: (key: ManifestCacheKey) => boolean,
  ): Promise<void> => {
    const op = markStaleInsteadOfEvict
      ? cache.markStale.bind(cache)
      : cache.evictMatching.bind(cache);
    const count = await op((key) => predicate(key));
    onEvict?.(type, count);
  };

  const evictByApp = async (type: string, app_id: string): Promise<void> => {
    await apply(type, (key) => key.app_id === app_id);
  };
  const evictByUser = async (type: string, user_id: string): Promise<void> => {
    await apply(type, (key) => key.user_id === user_id);
  };

  // Schema family — evict by app.
  const schemaTypes = [
    'capability.added',
    'capability.changed',
    'capability.removed',
    'capability.version_bumped',
    'component.added',
    'component.changed',
    'component.removed',
    'component.version_bumped',
    'skill.added',
    'skill.changed',
    'skill.removed',
    'skill.version_bumped',
    'policy.changed',
  ] as const;
  for (const type of schemaTypes) {
    unsubs.push(
      bus.subscribe(type, async (event) => {
        if ('app_id' in event && typeof event.app_id === 'string') {
          await evictByApp(event.type, event.app_id);
        }
      }),
    );
  }

  // Intent family — evict by user.
  const intentTypes = [
    'intent.preference_changed',
    'intent.lens_switched',
    'intent.rule_added',
    'intent.rule_removed',
    'intent.rule_modified',
    'intent.vocabulary_updated',
  ] as const;
  for (const type of intentTypes) {
    unsubs.push(
      bus.subscribe(type, async (event) => {
        if ('user_id' in event && typeof event.user_id === 'string') {
          await evictByUser(event.type, event.user_id);
        }
      }),
    );
  }

  // Explicit user triggers.
  unsubs.push(
    bus.subscribe('user.recompile_route', async (event) => {
      if (event.type !== 'user.recompile_route') return;
      await apply(event.type, (key) => key.user_id === event.user_id && key.route === event.route);
    }),
    bus.subscribe('user.recompile_all', async (event) => {
      if (event.type !== 'user.recompile_all') return;
      await evictByUser(event.type, event.user_id);
    }),
    bus.subscribe('user.try_lens', async (event) => {
      if (event.type !== 'user.try_lens') return;
      await evictByUser(event.type, event.user_id);
    }),
    // user.revert_manifest is intentionally not a cache eviction — the
    // runtime should serve the prior manifest, not refetch. The host's revert
    // flow handles this by writing the prior manifest into cache directly.
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
