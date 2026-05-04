// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marketplace bundle store — V-6.a / V-6.b.
 *
 * Content-addressed by the `(author, persona, version)` triple. Two impls:
 *
 *   - `InMemoryMarketplaceStore` — used by tests + the dev server when no
 *     persistent path is wired.
 *   - `FilesystemMarketplaceStore` — flat directory of JSON files. One
 *     bundle per file: `<root>/<author>/<persona>@<version>.json`. Reads
 *     are O(1) for exact-version, O(N) for `latest` (we list the
 *     `<author>/` directory and semver-sort).
 *
 * The store also exposes `latest(author, persona)` for the consume
 * endpoint's `/latest` route. Semver sort is stable: pre-release < release
 * (per semver.org), so `1.0.0` sorts after `1.0.0-rc.1`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { MarketplaceAddress, SignedBundle } from '@atelier/schemas';

/**
 * Storage adapter for marketplace bundles.
 *
 * `put` is responsible for enforcing the duplicate-rejection policy — the
 * route layer maps a `false` return to a 409. Implementations MUST return
 * `false` when the exact `(author, persona, version)` triple is already
 * present.
 */
export interface MarketplaceStore {
  /** Persist a bundle. Returns `false` if the address already has one. */
  put(address: MarketplaceAddress, bundle: SignedBundle): Promise<boolean> | boolean;
  /** Look up a bundle by exact address. */
  get(address: MarketplaceAddress): Promise<SignedBundle | undefined> | SignedBundle | undefined;
  /**
   * Return the highest-semver bundle for an `(author, persona)` pair, or
   * `undefined` if none exist. Used by `GET .../latest`.
   */
  latest(
    author: string,
    persona: string,
  ): Promise<SignedBundle | undefined> | SignedBundle | undefined;
}

/** Canonical key for the in-memory map: `<author>/<persona>@<version>`. */
function addressKey(address: { author: string; persona: string; version: string }): string {
  return `${address.author}/${address.persona}@${address.version}`;
}

/** In-memory implementation — process-local, lost on restart. */
export class InMemoryMarketplaceStore implements MarketplaceStore {
  private readonly bundles = new Map<string, SignedBundle>();

  put(address: MarketplaceAddress, bundle: SignedBundle): boolean {
    const k = addressKey(address);
    if (this.bundles.has(k)) return false;
    this.bundles.set(k, bundle);
    return true;
  }

  get(address: MarketplaceAddress): SignedBundle | undefined {
    return this.bundles.get(addressKey(address));
  }

  latest(author: string, persona: string): SignedBundle | undefined {
    const candidates: SignedBundle[] = [];
    const prefix = `${author}/${persona}@`;
    for (const [k, v] of this.bundles) {
      if (k.startsWith(prefix)) candidates.push(v);
    }
    return pickLatest(candidates);
  }
}

/**
 * Filesystem implementation. One JSON file per bundle:
 * `<root>/<author>/<persona>@<version>.json`. Synchronous I/O — same
 * style as `JsonFileVaultStorage` and the legacy
 * `JsonFileMarketplaceStorage`.
 */
export class FilesystemMarketplaceStore implements MarketplaceStore {
  constructor(private readonly root: string) {}

  private pathFor(address: { author: string; persona: string; version: string }): string {
    return join(this.root, address.author, `${address.persona}@${address.version}.json`);
  }

  put(address: MarketplaceAddress, bundle: SignedBundle): boolean {
    const filePath = this.pathFor(address);
    if (existsSync(filePath)) return false;
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf8');
    return true;
  }

  get(address: MarketplaceAddress): SignedBundle | undefined {
    const filePath = this.pathFor(address);
    if (!existsSync(filePath)) return undefined;
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as SignedBundle;
    } catch {
      return undefined;
    }
  }

  latest(author: string, persona: string): SignedBundle | undefined {
    const authorDir = join(this.root, author);
    if (!existsSync(authorDir)) return undefined;
    const prefix = `${persona}@`;
    const candidates: SignedBundle[] = [];
    for (const entry of readdirSync(authorDir)) {
      if (!entry.startsWith(prefix) || !entry.endsWith('.json')) continue;
      try {
        const bundle = JSON.parse(readFileSync(join(authorDir, entry), 'utf8')) as SignedBundle;
        candidates.push(bundle);
      } catch {
        /* skip malformed file */
      }
    }
    return pickLatest(candidates);
  }
}

/**
 * Pick the highest-semver bundle from a list. Uses a strict semver
 * comparator (numeric segments + pre-release ordering per semver.org §11).
 *
 * Why hand-rolled: pulling in `semver` for one comparator is heavier than
 * the function below; the comparator is small and is exercised by the
 * `latest` tests directly.
 */
function pickLatest(bundles: readonly SignedBundle[]): SignedBundle | undefined {
  if (bundles.length === 0) return undefined;
  let best = bundles[0]!;
  for (let i = 1; i < bundles.length; i += 1) {
    if (compareSemver(bundles[i]!.address.version, best.address.version) > 0) {
      best = bundles[i]!;
    }
  }
  return best;
}

/** Strict semver comparator: returns >0 if a > b, <0 if a < b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa.parts[i]! !== pb.parts[i]!) return pa.parts[i]! - pb.parts[i]!;
  }
  // Pre-release ordering: a version with a pre-release is LOWER than the
  // same version without one. Two pre-release tags compare lexically with
  // numeric-segment awareness.
  if (pa.pre === undefined && pb.pre === undefined) return 0;
  if (pa.pre === undefined) return 1;
  if (pb.pre === undefined) return -1;
  return comparePrerelease(pa.pre, pb.pre);
}

function parseSemver(v: string): { parts: [number, number, number]; pre?: string } {
  // The schema validates this format upstream; here we just split.
  const dashIdx = v.indexOf('-');
  const plusIdx = v.indexOf('+');
  let core = v;
  let pre: string | undefined;
  // Build metadata is ignored for ordering (semver §10).
  if (plusIdx !== -1 && (dashIdx === -1 || plusIdx < dashIdx)) {
    core = v.slice(0, plusIdx);
  } else if (dashIdx !== -1) {
    core = v.slice(0, dashIdx);
    const tail = v.slice(dashIdx + 1);
    const buildIdx = tail.indexOf('+');
    pre = buildIdx === -1 ? tail : tail.slice(0, buildIdx);
  }
  const segs = core.split('.').map((s) => Number.parseInt(s, 10));
  const parts: [number, number, number] = [segs[0] ?? 0, segs[1] ?? 0, segs[2] ?? 0];
  return pre === undefined ? { parts } : { parts, pre };
}

function comparePrerelease(a: string, b: string): number {
  const aa = a.split('.');
  const bb = b.split('.');
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const ai = aa[i];
    const bi = bb[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) {
      const d = Number.parseInt(ai, 10) - Number.parseInt(bi, 10);
      if (d !== 0) return d;
    } else if (aNum) {
      return -1; // numeric < alphanumeric per §11
    } else if (bNum) {
      return 1;
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return 0;
}
