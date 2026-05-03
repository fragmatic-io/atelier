// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Bundled default illustrations — Wave 11 (Vis-5).
 *
 * A small curated set so the default `<EmptyState illustration="…">` looks
 * coherent without the host wiring a custom pack. Each shape is a simple
 * geometric mascot built from circles + lines (no external assets, no font
 * dependency, layout-stable at any size). Hosts that want richer artwork
 * compose their own `MapIllustrationResolver` (or implement
 * `IllustrationResolver` from scratch) and mount it via
 * `<IllustrationResolverProvider>`.
 *
 * Names kept terse and situation-specific:
 *   - `inbox-zero`  — "queue is empty" / "nothing to do" celebratory state.
 *   - `no-results` — search came back blank.
 *   - `error`      — something failed; pair with a retry action.
 *   - `loading`    — async state placeholder (separate from `<Spinner>`).
 *   - `placeholder`— generic neutral shape for one-offs.
 *
 * The SVGs use `currentColor` so they tint with the surrounding text colour
 * — hosts get dark-mode + brand-tint adaptation for free.
 */
import {
  MapIllustrationResolver,
  type IllustrationEntry,
  type IllustrationResolver,
} from './resolver.js';

/** Common viewBox for the bundled illustrations (96×96 keeps shapes crisp at 64–128px). */
const VB = '0 0 96 96';

const inboxZero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="48" cy="48" r="32" opacity="0.25"/><path d="M28 52h12l4 8h8l4-8h12"/><path d="M28 52V36l8-12h24l8 12v16"/><circle cx="48" cy="32" r="2" fill="currentColor"/></svg>`;

const noResults = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="42" cy="42" r="20"/><path d="M58 58l14 14"/><path d="M34 42h16M42 34v16" opacity="0.4"/></svg>`;

const errorMascot = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="48" cy="48" r="32" opacity="0.25"/><path d="M48 30v22"/><circle cx="48" cy="62" r="2" fill="currentColor"/></svg>`;

const loadingMascot = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="48" cy="48" r="28" opacity="0.2"/><path d="M48 20a28 28 0 0 1 28 28"/><circle cx="48" cy="48" r="4" fill="currentColor"/></svg>`;

const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="20" width="56" height="56" rx="8" opacity="0.3"/><circle cx="36" cy="40" r="4" fill="currentColor"/><path d="M28 64l12-12 8 8 12-12 8 8"/></svg>`;

/**
 * The bundled illustration map. Frozen so consumers can't mutate it; copy
 * via `{ ...DEFAULT_ILLUSTRATIONS }` if you want to extend it.
 */
export const DEFAULT_ILLUSTRATIONS: Readonly<Record<string, IllustrationEntry>> = Object.freeze({
  'inbox-zero': { svg: inboxZero, label: 'Empty inbox' },
  'no-results': { svg: noResults, label: 'No matching results' },
  error: { svg: errorMascot, label: 'Error' },
  loading: { svg: loadingMascot, label: 'Loading' },
  placeholder: { svg: placeholder, label: 'Placeholder' },
});

/**
 * Convenience factory: a `MapIllustrationResolver` already populated with
 * the bundled defaults. Most hosts can use this directly:
 *
 * ```tsx
 * <IllustrationResolverProvider resolver={createDefaultIllustrationResolver()}>
 *   <App />
 * </IllustrationResolverProvider>
 * ```
 */
export function createDefaultIllustrationResolver(): IllustrationResolver {
  return new MapIllustrationResolver(DEFAULT_ILLUSTRATIONS);
}
