// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Nav-4 — Drilldown trail serialization.
 *
 * Stripe's "Charges › ch_xxx › Refund r_yyy" breadcrumb survives reload + share
 * because the trail is part of the URL. Atelier ships the data shape and the
 * (de)serializer; the host owns the URL update (Next.js router, React Router,
 * `window.history`, etc.) so this layer stays framework-agnostic.
 *
 * Wire format
 * -----------
 * One query-string-safe value, segments separated by `|`. Within a segment,
 * the optional `id` is appended after a single `_` separator:
 *
 *   `?_trail=charges|ch_xxx|refund_r_yyy`
 *
 * Each segment is `{label}` or `{label}_{id}`. Labels and ids are
 * `encodeURIComponent`-escaped on serialize and `decodeURIComponent`-decoded
 * on parse so embedded `|`, `_`, or `=` round-trip cleanly.
 *
 * The format is deliberately tiny: a 3-deep trail of 8-char labels + ids fits
 * in well under 100 chars including the key. Anything more elaborate (JSON
 * blob, base64) was rejected because URL-bar legibility is part of the value
 * — a developer eyeballing the URL should see the trail.
 *
 * Round-trip contract
 * -------------------
 * `parseTrail(serializeTrail(t))` returns a structurally-equal trail for any
 * valid input (labels and ids that survive `encodeURIComponent`).
 * Empty / whitespace input parses as an empty array (host treats this as
 * "no trail"); empty trail serializes as `''`.
 */

/**
 * One step in the trail. `label` is what the breadcrumb renders; `id` is the
 * optional identifier the host uses to reconstruct a deep link. `href` is an
 * explicit override hosts may set when they don't want the default
 * `onNavigate(segment, index)` behaviour.
 */
export interface TrailSegment {
  /** Display label (e.g. "Charges", "ch_xxx"). */
  label: string;
  /** Optional id; the URL serializer can reconstruct the deep link. */
  id?: string;
  /** Optional explicit href; if omitted, the host derives from segments. */
  href?: string;
}

const SEG_SEP = '|';
const ID_SEP = '_';

/**
 * Both `_` and `|` are RFC-3986-unreserved and survive `encodeURIComponent`.
 * Stripe-shaped ids like `ch_xxx` are full of `_`s, so a naive split on the
 * first `_` would mis-parse `ch_xxx_ch_xxx` as `{label:'ch', id:'xxx_ch_xxx'}`.
 *
 * We additionally percent-escape these two characters BEFORE the standard
 * `encodeURIComponent` pass so the wire-format delimiters are unambiguous.
 * The visible URL still looks like `charges|ch_xxx_ch_xxx|refund_r_yyy`
 * because the `_`s INSIDE the ids are encoded as `%5F` while the structural
 * `_` between label and id stays literal.
 */
function escapePart(s: string): string {
  // `encodeURIComponent` first (handles `|`, `?`, `#`, `=`, `&`, etc.), then
  // hand-escape the two delimiters that survived. Order matters: do the
  // `_` and `|` swap AFTER `encodeURIComponent` so we don't double-encode.
  return encodeURIComponent(s).replace(/_/g, '%5F').replace(/\|/g, '%7C');
}

/**
 * Encode a single segment. The `href` field is intentionally NOT serialized
 * — it is a runtime affordance for the host, not part of the persisted shape.
 */
function encodeSegment(seg: TrailSegment): string {
  const label = escapePart(seg.label);
  if (seg.id === undefined || seg.id === '') return label;
  return `${label}${ID_SEP}${escapePart(seg.id)}`;
}

/**
 * Decode one segment piece (a `{label}` or `{label}_{id}` chunk). Returns
 * `null` for empty / decode-failure cases so the parent parser can drop them
 * silently — a malformed share-link should degrade to no-trail rather than
 * crash the route. Splits on the FIRST literal `_` because the encoder
 * percent-escapes any `_`s in the payload.
 */
function decodeSegment(piece: string): TrailSegment | null {
  if (piece.length === 0) return null;
  const sepIdx = piece.indexOf(ID_SEP);
  let labelRaw: string;
  let idRaw: string | undefined;
  if (sepIdx === -1) {
    labelRaw = piece;
    idRaw = undefined;
  } else {
    labelRaw = piece.slice(0, sepIdx);
    idRaw = piece.slice(sepIdx + 1);
  }
  try {
    const label = decodeURIComponent(labelRaw);
    if (label.length === 0) return null;
    if (idRaw === undefined || idRaw.length === 0) return { label };
    return { label, id: decodeURIComponent(idRaw) };
  } catch {
    return null;
  }
}

/**
 * Serialize a trail to a query-string-safe value. Caller plugs the result
 * into `?_trail=…` (or whatever key it picks). Empty trail → `''`.
 */
export function serializeTrail(trail: readonly TrailSegment[]): string {
  if (trail.length === 0) return '';
  return trail.map(encodeSegment).join(SEG_SEP);
}

/**
 * Parse a serialized trail value. Accepts either:
 *  - the raw value (`'charges|ch_xxx|refund_r_yyy'`), or
 *  - a full query string (`'?_trail=charges|ch_xxx&foo=1'`) — in which case
 *    the function extracts the `_trail` (or caller-supplied) key.
 *
 * Malformed pieces are silently dropped so a share-link that lost a `%` in
 * transit still renders SOMETHING rather than blowing up the route.
 */
export function parseTrail(query: string, key = '_trail'): readonly TrailSegment[] {
  if (query.length === 0) return [];
  let raw = query;
  // If it looks like a query string, pull the named key out of it. We do
  // the extraction by hand instead of via `URLSearchParams.get(key)` because
  // that API percent-decodes the value before returning it — and we
  // INTENTIONALLY keep `%5F` (escaped `_`) and `%7C` (escaped `|`) in the
  // raw form so the structural delimiters stay unambiguous.
  if (query.includes('=') || query.startsWith('?')) {
    const extracted = extractRawValue(query, key);
    if (extracted === null) return [];
    raw = extracted;
  }
  if (raw.length === 0) return [];
  const out: TrailSegment[] = [];
  for (const piece of raw.split(SEG_SEP)) {
    const seg = decodeSegment(piece);
    if (seg !== null) out.push(seg);
  }
  return out;
}

/**
 * Hand-roll the equivalent of `URLSearchParams.get(key)` that returns the
 * RAW value (no percent-decoding). Returns `null` when the key is absent.
 */
function extractRawValue(query: string, key: string): string | null {
  const q = query.startsWith('?') ? query.slice(1) : query;
  if (q.length === 0) return null;
  const target = `${key}=`;
  for (const pair of q.split('&')) {
    if (pair.startsWith(target)) return pair.slice(target.length);
    if (pair === key) return '';
  }
  return null;
}
