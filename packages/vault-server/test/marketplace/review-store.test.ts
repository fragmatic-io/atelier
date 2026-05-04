// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for V-6.d `ReviewStore` impls.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MarketplaceAddress, ReviewRecord } from '@atelier/schemas';

import {
  FilesystemReviewStore,
  InMemoryReviewStore,
  InMemoryReviewerKeyDirectory,
  makePendingReviewRecord,
} from '../../src/marketplace/review-store.js';

function addr(version = '1.0.0', persona = 'p', author = 'acme'): MarketplaceAddress {
  return { scheme: 'atelier', author, persona, version };
}

function record(state: ReviewRecord['state'] = 'pending', version = '1.0.0'): ReviewRecord {
  return {
    address: addr(version),
    state,
    submitted_at: '2026-05-02T12:00:00.000Z',
  };
}

describe('InMemoryReviewStore', () => {
  it('puts + gets a record by address', () => {
    const store = new InMemoryReviewStore();
    const r = record();
    store.put(r);
    expect(store.get(r.address)).toEqual(r);
  });

  it('overwrites an existing record on put', () => {
    const store = new InMemoryReviewStore();
    store.put(record('pending'));
    const approved: ReviewRecord = {
      ...record('approved'),
      reviewed_at: '2026-05-03T08:00:00.000Z',
      reviewer_id: 'maint-a',
    };
    store.put(approved);
    expect(store.get(addr())).toEqual(approved);
  });

  it('list() returns every record', () => {
    const store = new InMemoryReviewStore();
    store.put(record('pending', '1.0.0'));
    store.put(record('approved', '1.1.0'));
    expect(store.list().length).toBe(2);
  });

  it('returns undefined for an unknown address', () => {
    const store = new InMemoryReviewStore();
    expect(store.get(addr('9.9.9'))).toBeUndefined();
  });
});

describe('FilesystemReviewStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cir-mp-review-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists a record across instances', () => {
    const a = new FilesystemReviewStore(dir);
    a.put(record('approved'));
    const reread = new FilesystemReviewStore(dir).get(addr());
    expect(reread?.state).toBe('approved');
  });

  it('list() walks every author dir', () => {
    const store = new FilesystemReviewStore(dir);
    store.put(record('approved', '1.0.0'));
    const r2: ReviewRecord = {
      ...record('flagged', '2.0.0'),
      address: { ...addr('2.0.0'), author: 'aurora' },
    };
    store.put(r2);
    const all = store.list();
    expect(all.length).toBe(2);
  });

  it('returns [] when the root does not yet exist', () => {
    const store = new FilesystemReviewStore(join(dir, 'never-created'));
    expect(store.list().length).toBe(0);
  });
});

describe('makePendingReviewRecord', () => {
  it('builds a clean pending record with no reviewer fields', () => {
    const r = makePendingReviewRecord(addr(), '2026-05-02T12:00:00.000Z');
    expect(r).toEqual({
      address: addr(),
      state: 'pending',
      submitted_at: '2026-05-02T12:00:00.000Z',
    });
    // No reviewed_at / reviewer_id / notes on a fresh pending record.
    expect(r.reviewed_at).toBeUndefined();
    expect(r.reviewer_id).toBeUndefined();
    expect(r.notes).toBeUndefined();
  });
});

describe('InMemoryReviewerKeyDirectory', () => {
  it('register + get round-trip', () => {
    const dir = new InMemoryReviewerKeyDirectory();
    const key = new Uint8Array(32);
    key.fill(7);
    dir.register('maint-a', key);
    expect(dir.get('maint-a')).toEqual(key);
  });

  it('throws on a key that is not 32 bytes', () => {
    const dir = new InMemoryReviewerKeyDirectory();
    expect(() => dir.register('maint', new Uint8Array(31))).toThrow(/32 raw bytes/);
  });

  it('returns undefined for an unknown reviewer', () => {
    const dir = new InMemoryReviewerKeyDirectory();
    expect(dir.get('nobody')).toBeUndefined();
  });

  it('remove() forgets the key', () => {
    const dir = new InMemoryReviewerKeyDirectory();
    const key = new Uint8Array(32);
    key.fill(1);
    dir.register('maint', key);
    dir.remove('maint');
    expect(dir.get('maint')).toBeUndefined();
  });
});
