// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Shared `IconRef` shape used by every component that accepts an optional
 * leading icon (Button, Alert, EmptyState, MetaBadge, …).
 *
 * Wave 11 / Vis-3. Components historically took `icon: { set, name }`. The
 * Wave 11 finalisation also accepts a bare string (`<Button icon="archive">`)
 * which resolves against the `DEFAULT_ICON_SET`. The string form is the
 * shape an LLM is most likely to author in a manifest — `{ set: 'lucide',
 * name: 'archive' }` is a layering leak that hides the marketplace
 * primitive's purpose.
 *
 * `DEFAULT_ICON_SET` is `'lucide'` because that's the pack `LucideIconResolver`
 * (the reference adapter Atelier ships) recognises. Hosts that wire other
 * packs continue to pass the explicit `{ set, name }` form.
 */

/** Default set id when `icon` is a bare string. */
export const DEFAULT_ICON_SET = 'lucide';

/**
 * Shape accepted by component `icon` props. Either a bare string (`'archive'`)
 * which resolves against `DEFAULT_ICON_SET`, or a `{ set, name }` bag for
 * hosts that wire multi-pack resolvers.
 */
export type IconRef = string | { set: string; name: string };

/** Narrow helper — true when `icon` is a `{ set, name }` bag. */
function isIconObject(icon: IconRef): icon is { set: string; name: string } {
  return typeof icon === 'object' && icon !== null;
}

/** Normalise an `IconRef` into a concrete `{ set, name }` pair. */
export function normalizeIconRef(icon: IconRef): { set: string; name: string } {
  if (isIconObject(icon)) return { set: icon.set, name: icon.name };
  return { set: DEFAULT_ICON_SET, name: icon };
}
