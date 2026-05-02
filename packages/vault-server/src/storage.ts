// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Storage adapter for the vault server.
 *
 * Two layers: a typed `VaultStorage` interface, and a JSON-file
 * implementation with an in-memory variant for tests.
 *
 * Why JSON file: the brief preferred the JSON-file approach for v0
 * simplicity (Node 22's experimental `node:sqlite` is gated on a flag in
 * 22.5+; a stable path lands in 24). The interface is small enough that
 * a SQLite or Postgres adapter is a drop-in replacement when needed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IntentProfile } from '@atelier/schemas';

/** A persisted grant record. The token itself is signed and not stored
 * (we only need the metadata to enforce revocation and audit). */
export interface GrantRecord {
  jti: string;
  app_id: string;
  user_id: string;
  scopes: string[];
  /** Unix seconds. */
  iat: number;
  exp: number;
  purpose?: string;
  /** Set when revoked. Unix seconds. */
  revoked_at?: number;
}

/** The complete on-disk shape. Versioned so we can migrate later. */
export interface VaultStorageState {
  schema_version: 1;
  /** Per-user intent profiles, keyed by user_id. */
  profiles: Record<string, IntentProfile>;
  /** All grants ever issued, keyed by jti. Active + revoked + expired. */
  grants: Record<string, GrantRecord>;
}

const EMPTY_STATE: VaultStorageState = {
  schema_version: 1,
  profiles: {},
  grants: {},
};

export interface VaultStorage {
  getProfile(userId: string): IntentProfile | undefined;
  putProfile(profile: IntentProfile): void;
  getGrant(jti: string): GrantRecord | undefined;
  putGrant(grant: GrantRecord): void;
  /** Mark an existing grant revoked. Returns the updated record, or undefined if not found. */
  revokeGrant(jti: string, atSeconds: number): GrantRecord | undefined;
  /** All grants for a given user_id; useful for the consent UI. */
  listGrantsByUser(userId: string): GrantRecord[];
  /** Snapshot the current state (used by the JSON adapter to write to disk). */
  snapshot(): VaultStorageState;
}

/** In-memory storage. Tests use this directly; the file adapter wraps it. */
export class MemoryVaultStorage implements VaultStorage {
  private state: VaultStorageState;

  constructor(initial: VaultStorageState = EMPTY_STATE) {
    // Deep copy so callers can't mutate the seed.
    this.state = JSON.parse(JSON.stringify(initial)) as VaultStorageState;
  }

  getProfile(userId: string): IntentProfile | undefined {
    return this.state.profiles[userId];
  }

  putProfile(profile: IntentProfile): void {
    this.state.profiles[profile.user_id] = profile;
  }

  getGrant(jti: string): GrantRecord | undefined {
    return this.state.grants[jti];
  }

  putGrant(grant: GrantRecord): void {
    this.state.grants[grant.jti] = grant;
  }

  revokeGrant(jti: string, atSeconds: number): GrantRecord | undefined {
    const existing = this.state.grants[jti];
    if (existing === undefined) return undefined;
    const updated: GrantRecord = { ...existing, revoked_at: atSeconds };
    this.state.grants[jti] = updated;
    return updated;
  }

  listGrantsByUser(userId: string): GrantRecord[] {
    return Object.values(this.state.grants).filter((g) => g.user_id === userId);
  }

  snapshot(): VaultStorageState {
    return JSON.parse(JSON.stringify(this.state)) as VaultStorageState;
  }
}

/**
 * JSON-file storage. Reads the file on construction (creates it empty if it
 * doesn't exist), keeps an in-memory mirror, and writes the whole file on
 * every mutation. Sufficient for v0 (single-process, low write volume); a
 * SQLite/Postgres adapter is the upgrade path when concurrency matters.
 *
 * Atomicity: writes go via `writeFileSync` directly. On crash mid-write the
 * file may be truncated; the next boot recovers from the previous state by
 * reading the empty fallback. A pre-prod deployment should swap this for a
 * write-then-rename adapter or move to SQLite.
 */
export class JsonFileVaultStorage extends MemoryVaultStorage {
  private filePath: string;

  constructor(filePath: string) {
    super(JsonFileVaultStorage.readOrInit(filePath));
    this.filePath = filePath;
  }

  private static readOrInit(filePath: string): VaultStorageState {
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(EMPTY_STATE, null, 2), 'utf8');
      return EMPTY_STATE;
    }
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as VaultStorageState;
      if (parsed.schema_version !== 1) {
        throw new Error(
          `unsupported vault storage schema_version: ${String(parsed.schema_version)}`,
        );
      }
      return parsed;
    } catch (err) {
      throw new Error(
        `vault-server: failed to read ${filePath}: ${(err as Error).message}. Delete the file to start fresh.`,
      );
    }
  }

  private flush(): void {
    writeFileSync(this.filePath, JSON.stringify(this.snapshot(), null, 2), 'utf8');
  }

  override putProfile(profile: IntentProfile): void {
    super.putProfile(profile);
    this.flush();
  }

  override putGrant(grant: GrantRecord): void {
    super.putGrant(grant);
    this.flush();
  }

  override revokeGrant(jti: string, atSeconds: number): GrantRecord | undefined {
    const updated = super.revokeGrant(jti, atSeconds);
    if (updated !== undefined) this.flush();
    return updated;
  }
}
