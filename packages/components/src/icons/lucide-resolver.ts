// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// Triple-slash directive ensures `lucide-react.d.ts` is loaded by downstream
// package typechecks (Next.js apps walking the source entrypoint) where
// co-located .d.ts files aren't auto-discovered. lucide-react v1.x has no
// .d.ts for its per-icon subpath imports; the local declaration covers them.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./lucide-react.d.ts" />
/**
 * `LucideIconResolver` — concrete `IconResolver` backed by [Lucide](https://lucide.dev).
 *
 * Wave 11 / Vis-3. Lucide is the de-facto open-source icon set (~1500
 * icons, MIT/ISC), with consistent 24×24 grid + 2px stroke. Atelier ships
 * Lucide as the reference adapter; hosts can plug other packs by
 * implementing `IconResolver` directly.
 *
 * ## Why a curated roster, not all 3900+ icons
 *
 * `lucide-react` exports ~3900 icon components. Eagerly importing every
 * `__iconNode` would balloon the bundle past 1 MB and defeat the marketplace
 * pattern (ethos #4 — constrained surface). Instead, we curate a roster of
 * icons that the baseline components actually need (severity icons for
 * Alert, common verbs for Button, illustration icons for EmptyState, status
 * dots for MetaBadge) and let hosts extend the roster via the constructor's
 * `extend` option.
 *
 * ## Resolver behaviour
 *
 * - `resolve('lucide', name)` returns the SVG markup string when `name` is
 *   in the curated roster (or in the host's `extend` map). Other sets
 *   (`'phosphor'`, `'heroicons'`) return `null`.
 * - Unknown names within `'lucide'` return `null` and emit a one-time
 *   `console.warn` per (set, name) so hosts notice missing icons during
 *   development without spamming production logs.
 * - The `<Icon>` component renders a layout-stable placeholder when the
 *   resolver returns null, so missing icons never crash the tree.
 *
 * ## BrandKit guard
 *
 * When `allowedSets` is supplied, the resolver returns `null` for any set
 * that isn't in the allow-list (and warns once). This honours the runtime
 * contract of `BrandIconographySchema.allowed_sets`. Hosts wire it like:
 *
 * ```ts
 * import { LucideIconResolver } from '@atelier/components';
 * const resolver = new LucideIconResolver({
 *   allowedSets: brandKit.iconography?.allowed_sets,
 * });
 * ```
 *
 * ## Extending the roster
 *
 * To add icons beyond the default roster:
 *
 * ```ts
 * import { __iconNode as gitBranch } from 'lucide-react/dist/esm/icons/git-branch.mjs';
 * import { LucideIconResolver, lucideIconNodeToSvg } from '@atelier/components';
 *
 * const resolver = new LucideIconResolver({
 *   extend: { 'git-branch': lucideIconNodeToSvg(gitBranch) },
 * });
 * ```
 *
 * Hosts that want a different baseline trim the default roster instead by
 * passing `replace` (see `LucideIconResolverOptions`).
 */
import type { IconResolver } from './resolver.js';

/**
 * The shape of a Lucide `__iconNode` — a tuple-array of `[tag, attrs]`
 * pairs. Mirrors `lucide-react`'s internal IconNode but typed locally so
 * we don't depend on internal types that might change shape.
 */
export type LucideIconNode = ReadonlyArray<
  readonly [string, Readonly<Record<string, string | number>>]
>;

/**
 * Default Lucide SVG attributes (24×24 grid, 2px stroke, currentColor).
 * Mirrors `lucide-react/dist/esm/defaultAttributes.mjs`. Re-stated here so
 * the resolver doesn't reach into lucide-react's non-public path.
 */
const LUCIDE_DEFAULT_ATTRS: Readonly<Record<string, string | number>> = Object.freeze({
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

/**
 * SVG attribute names that are case-sensitive in SVG and must NOT be
 * kebab-cased (they're already in their correct serialized form). The
 * remaining camelCase keys lucide uses (`strokeWidth`, `strokeLinecap`,
 * `strokeLinejoin`) ARE in React form and need kebab-casing.
 */
const SVG_PRESERVE_CASE: ReadonlySet<string> = new Set([
  'viewBox',
  'preserveAspectRatio',
  'clipPath',
  'fillRule',
  'clipRule',
  'gradientUnits',
  'gradientTransform',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'spreadMethod',
  'textAnchor',
  'xmlns',
]);

/**
 * Convert a camelCase React attribute name to its kebab-case SVG/HTML
 * equivalent, leaving already-kebab keys (no uppercase) untouched. Keys in
 * `SVG_PRESERVE_CASE` are returned as-is because SVG itself uses camelCase
 * for them.
 */
function svgAttrName(key: string): string {
  if (SVG_PRESERVE_CASE.has(key)) return key;
  return key.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Render a single attrs record into an SVG attribute string suitable for
 * inlining inside a tag. Numeric values stringify; values are HTML-escaped
 * so ampersands / quotes can't break out of the attribute context.
 */
function attrsToString(attrs: Readonly<Record<string, string | number>>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    // `key` is allowed to be supplied (lucide uses it for React reconciliation).
    // Filter it out so it doesn't end up in the SVG.
    if (key === 'key') continue;
    const name = svgAttrName(key);
    const escaped = String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    parts.push(`${name}="${escaped}"`);
  }
  return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
}

/**
 * Convert a Lucide `__iconNode` (array of `[tag, attrs]`) into a complete
 * `<svg …>` markup string. Exposed so hosts that extend the roster can
 * project additional iconNodes through the same pipeline.
 *
 * The output is safe to inject via `dangerouslySetInnerHTML` because:
 *  - Tag names come from lucide's static iconNode (whitelist of 8 SVG tags).
 *  - Attribute values are HTML-escaped.
 *  - There are no event handlers, scripts, or external references.
 */
export function lucideIconNodeToSvg(iconNode: LucideIconNode): string {
  const inner = iconNode.map(([tag, attrs]) => `<${tag}${attrsToString(attrs)} />`).join('');
  return `<svg${attrsToString(LUCIDE_DEFAULT_ATTRS)}>${inner}</svg>`;
}

// -----------------------------------------------------------------------------
// Curated default roster — the icons the baseline @atelier/components surface
// reaches for. Eagerly imported so the resolver is sync. Each entry maps a
// kebab-case lucide name to its iconNode tuple.
// -----------------------------------------------------------------------------
//
// The list intentionally stays small (~50 names) so the bundle impact is
// bounded. Hosts that need more icons extend via `LucideIconResolverOptions.
// extend`.
//
// Subpath imports reach `lucide-react/dist/esm/icons/<name>.mjs`. Lucide-react
// has no `exports` field as of v1.14, so the subpath resolves through the
// filesystem. If a future version locks the subpath, the only change is to
// route through `'lucide-react'`'s top-level export and reconstruct iconNodes
// from the components — the resolver's public API is unchanged.

import { __iconNode as archive } from 'lucide-react/dist/esm/icons/archive.mjs';
import { __iconNode as inbox } from 'lucide-react/dist/esm/icons/inbox.mjs';
import { __iconNode as info } from 'lucide-react/dist/esm/icons/info.mjs';
// `alert-triangle`, `x-circle`, `circle-help` etc. are alias re-exports in
// lucide-react v1.x — they only re-export `default`, not `__iconNode`. We
// import from the canonical filenames and re-key the roster under both the
// canonical and alias names so consumers can use either form.
import { __iconNode as alertTriangle } from 'lucide-react/dist/esm/icons/triangle-alert.mjs';
import { __iconNode as circleCheck } from 'lucide-react/dist/esm/icons/circle-check.mjs';
import { __iconNode as xCircle } from 'lucide-react/dist/esm/icons/circle-x.mjs';
import { __iconNode as circleDot } from 'lucide-react/dist/esm/icons/circle-dot.mjs';
import { __iconNode as check } from 'lucide-react/dist/esm/icons/check.mjs';
import { __iconNode as x } from 'lucide-react/dist/esm/icons/x.mjs';
import { __iconNode as plus } from 'lucide-react/dist/esm/icons/plus.mjs';
import { __iconNode as minus } from 'lucide-react/dist/esm/icons/minus.mjs';
import { __iconNode as search } from 'lucide-react/dist/esm/icons/search.mjs';
import { __iconNode as settings } from 'lucide-react/dist/esm/icons/settings.mjs';
import { __iconNode as trash } from 'lucide-react/dist/esm/icons/trash.mjs';
import { __iconNode as trash2 } from 'lucide-react/dist/esm/icons/trash-2.mjs';
import { __iconNode as edit } from 'lucide-react/dist/esm/icons/pencil.mjs';
import { __iconNode as save } from 'lucide-react/dist/esm/icons/save.mjs';
import { __iconNode as copy } from 'lucide-react/dist/esm/icons/copy.mjs';
import { __iconNode as download } from 'lucide-react/dist/esm/icons/download.mjs';
import { __iconNode as upload } from 'lucide-react/dist/esm/icons/upload.mjs';
import { __iconNode as refresh } from 'lucide-react/dist/esm/icons/refresh-cw.mjs';
import { __iconNode as filter } from 'lucide-react/dist/esm/icons/funnel.mjs';
import { __iconNode as star } from 'lucide-react/dist/esm/icons/star.mjs';
import { __iconNode as heart } from 'lucide-react/dist/esm/icons/heart.mjs';
import { __iconNode as bell } from 'lucide-react/dist/esm/icons/bell.mjs';
import { __iconNode as calendar } from 'lucide-react/dist/esm/icons/calendar.mjs';
import { __iconNode as clock } from 'lucide-react/dist/esm/icons/clock.mjs';
import { __iconNode as user } from 'lucide-react/dist/esm/icons/user.mjs';
import { __iconNode as users } from 'lucide-react/dist/esm/icons/users.mjs';
import { __iconNode as mail } from 'lucide-react/dist/esm/icons/mail.mjs';
import { __iconNode as link } from 'lucide-react/dist/esm/icons/link.mjs';
import { __iconNode as externalLink } from 'lucide-react/dist/esm/icons/external-link.mjs';
import { __iconNode as eye } from 'lucide-react/dist/esm/icons/eye.mjs';
import { __iconNode as eyeOff } from 'lucide-react/dist/esm/icons/eye-off.mjs';
import { __iconNode as chevronDown } from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { __iconNode as chevronUp } from 'lucide-react/dist/esm/icons/chevron-up.mjs';
import { __iconNode as chevronLeft } from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import { __iconNode as chevronRight } from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import { __iconNode as arrowLeft } from 'lucide-react/dist/esm/icons/arrow-left.mjs';
import { __iconNode as arrowRight } from 'lucide-react/dist/esm/icons/arrow-right.mjs';
import { __iconNode as moreHorizontal } from 'lucide-react/dist/esm/icons/ellipsis.mjs';
import { __iconNode as moreVertical } from 'lucide-react/dist/esm/icons/ellipsis-vertical.mjs';
import { __iconNode as menu } from 'lucide-react/dist/esm/icons/menu.mjs';
import { __iconNode as home } from 'lucide-react/dist/esm/icons/house.mjs';
import { __iconNode as folder } from 'lucide-react/dist/esm/icons/folder.mjs';
import { __iconNode as file } from 'lucide-react/dist/esm/icons/file.mjs';
import { __iconNode as fileText } from 'lucide-react/dist/esm/icons/file-text.mjs';
import { __iconNode as tag } from 'lucide-react/dist/esm/icons/tag.mjs';
import { __iconNode as flag } from 'lucide-react/dist/esm/icons/flag.mjs';
import { __iconNode as bookmark } from 'lucide-react/dist/esm/icons/bookmark.mjs';
import { __iconNode as lock } from 'lucide-react/dist/esm/icons/lock.mjs';
import { __iconNode as unlock } from 'lucide-react/dist/esm/icons/lock-open.mjs';
import { __iconNode as helpCircle } from 'lucide-react/dist/esm/icons/circle-question-mark.mjs';

/**
 * Default Lucide roster — kebab-case names → iconNode tuples. Frozen at
 * module load. Each name maps to the lucide icon of the same canonical id
 * (e.g. `'archive'` → `Archive`, `'alert-triangle'` → `TriangleAlert`).
 *
 * The roster is intentionally curated to the icons the baseline components
 * are most likely to ask for. Extend via `LucideIconResolverOptions.extend`.
 */
export const LUCIDE_DEFAULT_ROSTER: ReadonlyMap<string, LucideIconNode> = Object.freeze(
  new Map<string, LucideIconNode>([
    ['archive', archive as LucideIconNode],
    ['inbox', inbox as LucideIconNode],
    ['info', info as LucideIconNode],
    // Severity icons. Both alias and canonical lucide names are accepted —
    // the underlying iconNode is identical.
    ['alert-triangle', alertTriangle as LucideIconNode],
    ['triangle-alert', alertTriangle as LucideIconNode],
    ['circle-check', circleCheck as LucideIconNode],
    ['x-circle', xCircle as LucideIconNode],
    ['circle-x', xCircle as LucideIconNode],
    ['circle-dot', circleDot as LucideIconNode],
    ['check', check as LucideIconNode],
    ['x', x as LucideIconNode],
    ['plus', plus as LucideIconNode],
    ['minus', minus as LucideIconNode],
    ['search', search as LucideIconNode],
    ['settings', settings as LucideIconNode],
    ['trash', trash as LucideIconNode],
    ['trash-2', trash2 as LucideIconNode],
    ['pencil', edit as LucideIconNode],
    ['save', save as LucideIconNode],
    ['copy', copy as LucideIconNode],
    ['download', download as LucideIconNode],
    ['upload', upload as LucideIconNode],
    ['refresh-cw', refresh as LucideIconNode],
    ['filter', filter as LucideIconNode],
    ['funnel', filter as LucideIconNode],
    ['star', star as LucideIconNode],
    ['heart', heart as LucideIconNode],
    ['bell', bell as LucideIconNode],
    ['calendar', calendar as LucideIconNode],
    ['clock', clock as LucideIconNode],
    ['user', user as LucideIconNode],
    ['users', users as LucideIconNode],
    ['mail', mail as LucideIconNode],
    ['link', link as LucideIconNode],
    ['external-link', externalLink as LucideIconNode],
    ['eye', eye as LucideIconNode],
    ['eye-off', eyeOff as LucideIconNode],
    ['chevron-down', chevronDown as LucideIconNode],
    ['chevron-up', chevronUp as LucideIconNode],
    ['chevron-left', chevronLeft as LucideIconNode],
    ['chevron-right', chevronRight as LucideIconNode],
    ['arrow-left', arrowLeft as LucideIconNode],
    ['arrow-right', arrowRight as LucideIconNode],
    ['more-horizontal', moreHorizontal as LucideIconNode],
    ['ellipsis', moreHorizontal as LucideIconNode],
    ['more-vertical', moreVertical as LucideIconNode],
    ['ellipsis-vertical', moreVertical as LucideIconNode],
    ['menu', menu as LucideIconNode],
    ['home', home as LucideIconNode],
    ['house', home as LucideIconNode],
    ['folder', folder as LucideIconNode],
    ['file', file as LucideIconNode],
    ['file-text', fileText as LucideIconNode],
    ['tag', tag as LucideIconNode],
    ['flag', flag as LucideIconNode],
    ['bookmark', bookmark as LucideIconNode],
    ['lock', lock as LucideIconNode],
    ['unlock', unlock as LucideIconNode],
    ['lock-open', unlock as LucideIconNode],
    ['circle-help', helpCircle as LucideIconNode],
    ['help-circle', helpCircle as LucideIconNode],
    ['circle-question-mark', helpCircle as LucideIconNode],
  ]),
);

/** Set id used by the resolver. Exported so hosts can match it in allow-lists. */
export const LUCIDE_SET_ID = 'lucide';

export interface LucideIconResolverOptions {
  /**
   * Additional icons to merge on top of the default roster. Keys are
   * lucide kebab-case names; values are either iconNode tuples (preferred —
   * the resolver projects them through `lucideIconNodeToSvg`) or pre-rendered
   * SVG strings (for hosts that want to ship custom artwork under the
   * `'lucide'` set umbrella).
   */
  extend?: Readonly<Record<string, LucideIconNode | string>>;
  /**
   * Replace the default roster entirely with the supplied roster. Useful
   * for hosts that want to ship a strict subset (e.g. only the 12 icons
   * their app actually uses). When `replace` is set, `extend` is ignored.
   */
  replace?: Readonly<Record<string, LucideIconNode | string>>;
  /**
   * BrandKit's `iconography.allowed_sets`. When supplied, any `resolve`
   * call whose `set` isn't in this list returns `null` and emits a one-time
   * console warn. Honours the schema's runtime contract.
   *
   * Pass `undefined` (the default) to disable the guard — useful in tests
   * and for hosts whose brand kit doesn't pin allow-lists.
   */
  allowedSets?: ReadonlyArray<string>;
  /**
   * Override the warn function. Defaults to `console.warn`. Tests pass a
   * `vi.fn()` here.
   */
  warn?: (message: string) => void;
}

/**
 * Concrete `IconResolver` backed by Lucide. Sync (no I/O), threadsafe,
 * idempotent. Construct once at host startup and pass to
 * `<IconResolverProvider resolver={…}>`.
 */
export class LucideIconResolver implements IconResolver {
  private readonly svg: ReadonlyMap<string, string>;
  private readonly allowedSets: ReadonlySet<string> | null;
  private readonly warn: (message: string) => void;
  private readonly warned: Set<string> = new Set();

  constructor(options: LucideIconResolverOptions = {}) {
    const { extend, replace, allowedSets, warn } = options;
    const base: Map<string, string> = new Map();

    const ingest = (
      source:
        | ReadonlyMap<string, LucideIconNode>
        | Readonly<Record<string, LucideIconNode | string>>,
    ): void => {
      const entries: Array<readonly [string, LucideIconNode | string]> =
        source instanceof Map
          ? Array.from(source.entries())
          : Object.entries(source as Record<string, LucideIconNode | string>);
      for (const [name, value] of entries) {
        const svg = typeof value === 'string' ? value : lucideIconNodeToSvg(value);
        base.set(name, svg);
      }
    };

    if (replace !== undefined) {
      ingest(replace);
    } else {
      ingest(LUCIDE_DEFAULT_ROSTER);
      if (extend !== undefined) ingest(extend);
    }

    this.svg = base;
    this.allowedSets = allowedSets !== undefined ? new Set(allowedSets) : null;
    this.warn = warn ?? ((message: string) => console.warn(message));
  }

  resolve(set: string, name: string): string | null {
    if (this.allowedSets !== null && !this.allowedSets.has(set)) {
      this.warnOnce(
        `set:${set}`,
        `[LucideIconResolver] icon set "${set}" is not in BrandKit.iconography.allowed_sets; returning null.`,
      );
      return null;
    }
    if (set !== LUCIDE_SET_ID) {
      // Resolver only knows the 'lucide' set. Other sets fall through to null.
      return null;
    }
    const svg = this.svg.get(name);
    if (svg === undefined) {
      this.warnOnce(
        `name:${name}`,
        `[LucideIconResolver] icon "lucide:${name}" is not in the resolver's roster; rendering placeholder. Extend via LucideIconResolverOptions.extend.`,
      );
      return null;
    }
    return svg;
  }

  /** Returns the resolver's full roster. Useful for tests and tooling. */
  knownNames(): ReadonlyArray<string> {
    return Array.from(this.svg.keys());
  }

  private warnOnce(token: string, message: string): void {
    if (this.warned.has(token)) return;
    this.warned.add(token);
    this.warn(message);
  }
}
