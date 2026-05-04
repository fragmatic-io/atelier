// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Author key directory — V-6.a / V-6.f.
 *
 * The marketplace publish endpoint verifies an ed25519 signature against
 * the AUTHOR'S registered public key, NOT the bundle's embedded
 * `public_key` (the legacy `/vault/marketplace/publish` endpoint did the
 * latter; that's a TOFU-on-the-server posture). Verifying against a known
 * directory means the host curates who is allowed to publish under each
 * author handle — the same posture an OS package repo takes.
 *
 * The directory is an interface so hosts can plug in a database, an
 * external IDP, or a static config file. We ship two impls:
 *
 *   - `StaticKeyDirectory` — built from a `Record<author, publicKey>`. The
 *     dev server uses this with author keys read from env / config.
 *   - `InMemoryKeyDirectory` — same shape, mutable. Tests use this to
 *     register + rotate keys at runtime.
 */
import { createHash } from 'node:crypto';

/**
 * Resolve an author handle to their registered ed25519 public key bytes.
 * Returns `undefined` when the author is unknown — the route maps that to
 * 401.
 */
export interface KeyDirectory {
  /** Look up the raw 32-byte ed25519 public key for an author. */
  get(author: string): Promise<Uint8Array | undefined> | Uint8Array | undefined;
}

/** Static, immutable directory built from a `{ author: publicKeyBytes }` map. */
export class StaticKeyDirectory implements KeyDirectory {
  private readonly map: ReadonlyMap<string, Uint8Array>;

  constructor(entries: Record<string, Uint8Array> | ReadonlyMap<string, Uint8Array>) {
    if (entries instanceof Map) {
      this.map = entries;
      return;
    }
    const m = new Map<string, Uint8Array>();
    for (const [k, v] of Object.entries(entries) as ReadonlyArray<[string, Uint8Array]>) {
      m.set(k, v);
    }
    this.map = m;
  }

  get(author: string): Uint8Array | undefined {
    return this.map.get(author);
  }
}

/** Mutable directory — used by tests + admin tools to register/rotate. */
export class InMemoryKeyDirectory implements KeyDirectory {
  private readonly map = new Map<string, Uint8Array>();

  /** Register or rotate the public key for an author. */
  register(author: string, publicKey: Uint8Array): void {
    if (publicKey.length !== 32) {
      throw new Error(`ed25519 public key must be 32 raw bytes (got ${String(publicKey.length)})`);
    }
    this.map.set(author, publicKey);
  }

  /** Forget an author's key. Subsequent publishes from them 401. */
  remove(author: string): void {
    this.map.delete(author);
  }

  get(author: string): Uint8Array | undefined {
    return this.map.get(author);
  }
}

/**
 * Compute the canonical 16-hex `key_id` fingerprint for a raw 32-byte
 * ed25519 public key. Mirrors the schemas package's `MarketplaceKeyId`
 * shape — `sha256(public_key)[:16]`.
 */
export function computeKeyId(publicKey: Uint8Array): string {
  return createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
}
