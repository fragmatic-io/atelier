// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
export class MemoryJournal {
  constructor({ maxEntries = 500 } = {}) {
    this.rows = new Map();
    this.maxEntries = maxEntries;
  }
  async get(id) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async set(id, value) {
    if (!this.rows.has(id) && this.rows.size >= this.maxEntries)
      throw new Error('Local journal quota reached');
    this.rows.set(id, structuredClone(value));
  }
  async delete(id) {
    this.rows.delete(id);
  }
  async list(prefix = '') {
    return [...this.rows]
      .filter(([id]) => id.startsWith(prefix))
      .map(([id, value]) => ({ id, value: structuredClone(value) }));
  }
  async clear() {
    this.rows.clear();
  }
  async close() {}
}
export class IndexedDbJournal {
  constructor({ namespace, database = 'atelier-conversations-v1', maxEntries = 500 } = {}) {
    if (typeof namespace !== 'string' || namespace.length < 8)
      throw new Error('Use a tenant/project/authenticated-subject namespace');
    this.namespace = namespace;
    this.maxEntries = maxEntries;
    this.opened = new Promise((ok, bad) => {
      const q = indexedDB.open(database, 1);
      q.onupgradeneeded = () =>
        q.result
          .createObjectStore('entries', { keyPath: ['namespace', 'id'] })
          .createIndex('namespace', 'namespace');
      q.onsuccess = () => ok(q.result);
      q.onerror = () => bad(q.error);
      q.onblocked = () => bad(new Error('Close an older tab before upgrading journal storage'));
    });
  }
  async tx(mode, fn) {
    const db = await this.opened;
    return new Promise((ok, bad) => {
      const t = db.transaction('entries', mode);
      let result;
      t.oncomplete = () => ok(result);
      t.onerror = () => bad(t.error);
      t.onabort = () => bad(t.error ?? new Error('Local journal quota or transaction failure'));
      try {
        fn(t.objectStore('entries'), (v) => (result = v), t);
      } catch (e) {
        t.abort();
        bad(e);
      }
    });
  }
  async get(id) {
    return this.tx('readonly', (s, done) => {
      const q = s.get([this.namespace, id]);
      q.onsuccess = () => done(q.result?.value ?? null);
    });
  }
  async set(id, value) {
    if (JSON.stringify(value).length > 2000000) throw new Error('Journal item exceeds limit');
    return this.tx('readwrite', (s, done, t) => {
      const existing = s.get([this.namespace, id]);
      existing.onsuccess = () => {
        const count = s.index('namespace').count(this.namespace);
        count.onsuccess = () => {
          if (!existing.result && count.result >= this.maxEntries) {
            t.abort();
            return;
          }
          s.put({ namespace: this.namespace, id, value });
          done();
        };
      };
    });
  }
  async delete(id) {
    return this.tx('readwrite', (s) => s.delete([this.namespace, id]));
  }
  async list(prefix = '') {
    return this.tx('readonly', (s, done) => {
      const q = s.index('namespace').getAll(this.namespace);
      q.onsuccess = () =>
        done(
          q.result.filter((x) => x.id.startsWith(prefix)).map(({ id, value }) => ({ id, value })),
        );
    });
  }
  async clear() {
    return this.tx('readwrite', (s, done) => {
      const q = s.index('namespace').openKeyCursor(this.namespace);
      q.onsuccess = () => {
        const c = q.result;
        if (c) {
          s.delete(c.primaryKey);
          c.continue();
        } else done();
      };
    });
  }
  async close() {
    (await this.opened).close();
  }
}
