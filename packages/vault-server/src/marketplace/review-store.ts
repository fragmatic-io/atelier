// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marketplace review-record store — V-6.d.
 *
 * Mirrors the shape of `MarketplaceStore` from V-6.a but stores
 * `ReviewRecord` rows keyed by `(author, persona, version)`. Two impls:
 *
 *   - `InMemoryReviewStore` — process-local, lost on restart. Used by
 *     tests + the dev server when no persistent path is wired.
 *   - `FilesystemReviewStore` — flat directory of JSON files, one row per
 *     file: `<root>/<author>/<persona>@<version>.json`.
 *
 * The store also exposes `list()` so the `/marketplace/index` endpoint can
 * iterate every approved row without re-walking the bundle store. The
 * route layer composes both: bundle existence comes from `MarketplaceStore`,
 * curation state comes from the review store.
 *
 * `ReviewerKeyDirectory` lives here too so server code can compose the
 * minimal "who is allowed to review" check next to its store. It is
 * intentionally a SEPARATE interface from the publish-side `KeyDirectory`
 * — a maintainer key is not the same as a publisher key.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { MarketplaceAddress, ReviewRecord, ReviewState } from '@atelier/schemas';

import type { KeyDirectory } from './key-directory.js';

/** Canonical key for the in-memory map: `<author>/<persona>@<version>`. */
function addressKey(address: { author: string; persona: string; version: string }): string {
  return `${address.author}/${address.persona}@${address.version}`;
}

/**
 * Storage adapter for review records. Reads + writes are address-keyed;
 * `list()` is the index-walk surface (`/marketplace/index` calls it).
 */
export interface ReviewStore {
  /** Persist (insert or update) a review record. */
  put(record: ReviewRecord): Promise<void> | void;
  /** Look up a record by exact address. Returns undefined on miss. */
  get(address: MarketplaceAddress): Promise<ReviewRecord | undefined> | ReviewRecord | undefined;
  /** Enumerate every record. The route layer filters by state. */
  list(): Promise<readonly ReviewRecord[]> | readonly ReviewRecord[];
}

/** In-memory implementation — process-local. Used by tests + dev server. */
export class InMemoryReviewStore implements ReviewStore {
  private readonly records = new Map<string, ReviewRecord>();

  put(record: ReviewRecord): void {
    this.records.set(addressKey(record.address), record);
  }

  get(address: MarketplaceAddress): ReviewRecord | undefined {
    return this.records.get(addressKey(address));
  }

  list(): readonly ReviewRecord[] {
    return Array.from(this.records.values());
  }
}

/**
 * Filesystem implementation. One JSON file per record:
 * `<root>/<author>/<persona>@<version>.json`. Synchronous I/O — same
 * style as `FilesystemMarketplaceStore`. The on-disk layout is
 * intentionally identical to the bundle store so a maintainer can
 * `ls` either tree and reason about it the same way.
 */
export class FilesystemReviewStore implements ReviewStore {
  constructor(private readonly root: string) {}

  private pathFor(address: { author: string; persona: string; version: string }): string {
    return join(this.root, address.author, `${address.persona}@${address.version}.json`);
  }

  put(record: ReviewRecord): void {
    const filePath = this.pathFor(record.address);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  }

  get(address: MarketplaceAddress): ReviewRecord | undefined {
    const filePath = this.pathFor(address);
    if (!existsSync(filePath)) return undefined;
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as ReviewRecord;
    } catch {
      return undefined;
    }
  }

  list(): readonly ReviewRecord[] {
    if (!existsSync(this.root)) return [];
    const out: ReviewRecord[] = [];
    for (const author of readdirSync(this.root)) {
      const authorDir = join(this.root, author);
      let entries: string[];
      try {
        entries = readdirSync(authorDir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        try {
          const rec = JSON.parse(readFileSync(join(authorDir, entry), 'utf8')) as ReviewRecord;
          out.push(rec);
        } catch {
          /* skip malformed file */
        }
      }
    }
    return out;
  }
}

/**
 * Resolve a maintainer ("reviewer") handle to their registered ed25519
 * public key bytes. Distinct from the publish-side `KeyDirectory`: a
 * publisher key proves "I am this author", a reviewer key proves "I am
 * an authorized maintainer". Most hosts will run two separate
 * directories; some may compose a single underlying store and surface
 * two views.
 *
 * Returning `undefined` means "this reviewer is unknown / unauthorized";
 * the route maps that to 401.
 */
export interface ReviewerKeyDirectory extends KeyDirectory {
  /** Look up the raw 32-byte ed25519 public key for a reviewer. */
  get(reviewerId: string): Promise<Uint8Array | undefined> | Uint8Array | undefined;
}

/**
 * In-memory `ReviewerKeyDirectory`. Same shape as `InMemoryKeyDirectory`
 * but reused under the reviewer hat — a separate type so the call sites
 * can't accidentally mix publish-keys with review-keys.
 */
export class InMemoryReviewerKeyDirectory implements ReviewerKeyDirectory {
  private readonly map = new Map<string, Uint8Array>();

  /** Register or rotate the public key for a reviewer. */
  register(reviewerId: string, publicKey: Uint8Array): void {
    if (publicKey.length !== 32) {
      throw new Error(`ed25519 public key must be 32 raw bytes (got ${String(publicKey.length)})`);
    }
    this.map.set(reviewerId, publicKey);
  }

  /** Forget a reviewer's key. Subsequent reviews from them 401. */
  remove(reviewerId: string): void {
    this.map.delete(reviewerId);
  }

  get(reviewerId: string): Uint8Array | undefined {
    return this.map.get(reviewerId);
  }
}

/** Create a `pending` record for a freshly-published bundle. */
export function makePendingReviewRecord(
  address: MarketplaceAddress,
  submittedAt: string,
): ReviewRecord {
  return {
    address: {
      scheme: 'atelier',
      author: address.author,
      persona: address.persona,
      version: address.version,
    },
    state: 'pending',
    submitted_at: submittedAt,
  };
}

/** Re-export the schema's `ReviewState` for callers who only need the type. */
export type { ReviewState };
