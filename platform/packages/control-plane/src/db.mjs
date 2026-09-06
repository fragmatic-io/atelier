// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, hash } from './util.mjs';
const migrationsDir = fileURLToPath(new URL('../../../migrations/', import.meta.url));
/** One durable writer per local filesystem. Never share a SQLite WAL over NFS. */
export class Database {
  constructor(path, { readOnly = false, migrate = true } = {}) {
    this.path = path;
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.raw = new DatabaseSync(path, { readOnly, timeout: 5000, allowExtension: false });
    this.raw.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF;');
    if (!readOnly) {
      this.raw.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      if (path !== ':memory:') chmodSync(path, 0o600);
      if (migrate) this.migrate();
    }
  }
  run(sql, ...params) {
    return this.raw.prepare(sql).run(...params);
  }
  get(sql, ...params) {
    return this.raw.prepare(sql).get(...params) ?? null;
  }
  all(sql, ...params) {
    return this.raw.prepare(sql).all(...params);
  }
  transaction(fn) {
    if (this.raw.isTransaction) return fn();
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      assert(!result?.then, 500, 'ASYNC_TRANSACTION', 'Do not await inside SQLite transactions');
      this.raw.exec('COMMIT');
      return result;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }
  migrate() {
    this.raw.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT;',
    );
    for (const name of readdirSync(migrationsDir)
      .filter((x) => x.endsWith('.sql'))
      .sort()) {
      const sql = readFileSync(resolve(migrationsDir, name), 'utf8');
      const checksum = hash(sql);
      const old = this.get('SELECT * FROM schema_migrations WHERE version=?', name);
      if (old) {
        assert(
          old.checksum === checksum,
          500,
          'MIGRATION_DRIFT',
          `Migration ${name} was modified after application`,
        );
        continue;
      }
      this.transaction(() => {
        this.raw.exec(sql);
        this.run('INSERT INTO schema_migrations VALUES(?,?,?)', name, checksum, Date.now());
      });
    }
  }
  async backup(path) {
    await backup(this.raw, path);
    chmodSync(path, 0o600);
    return path;
  }
  integrity() {
    return (
      this.get('PRAGMA integrity_check').integrity_check === 'ok' &&
      this.all('PRAGMA foreign_key_check').length === 0
    );
  }
  close() {
    if (this.raw.isOpen) this.raw.close();
  }
}
