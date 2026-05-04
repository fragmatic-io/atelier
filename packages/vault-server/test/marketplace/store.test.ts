// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `MarketplaceStore` impls — duplicate semantics, latest,
 * filesystem persistence.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MarketplaceAddress, SignedBundle } from '@atelier/schemas';

import {
  FilesystemMarketplaceStore,
  InMemoryMarketplaceStore,
} from '../../src/marketplace/store.js';

function bundle(version: string, persona = 'p', author = 'acme'): SignedBundle {
  const address: MarketplaceAddress = { scheme: 'atelier', author, persona, version };
  return {
    address,
    payload: { v: version },
    timestamp: '2026-05-02T12:00:00.000Z',
    signature: 'AAAA',
    public_key: 'BBBB',
    key_id: '0123456789abcdef',
  };
}

describe('InMemoryMarketplaceStore', () => {
  it('stores + reads back a bundle', () => {
    const store = new InMemoryMarketplaceStore();
    const b = bundle('1.0.0');
    expect(store.put(b.address, b)).toBe(true);
    expect(store.get(b.address)).toEqual(b);
  });

  it('rejects a duplicate `(author, persona, version)`', () => {
    const store = new InMemoryMarketplaceStore();
    const b = bundle('1.0.0');
    expect(store.put(b.address, b)).toBe(true);
    expect(store.put(b.address, b)).toBe(false);
  });

  it('returns the highest semver from `latest`', () => {
    const store = new InMemoryMarketplaceStore();
    store.put(bundle('1.0.0').address, bundle('1.0.0'));
    store.put(bundle('1.2.3').address, bundle('1.2.3'));
    store.put(bundle('0.9.0').address, bundle('0.9.0'));
    expect(store.latest('acme', 'p')?.address.version).toBe('1.2.3');
  });

  it('returns undefined from `latest` when no versions exist', () => {
    expect(new InMemoryMarketplaceStore().latest('acme', 'p')).toBeUndefined();
  });

  it('does not bleed across personas', () => {
    const store = new InMemoryMarketplaceStore();
    store.put(bundle('1.0.0', 'p1').address, bundle('1.0.0', 'p1'));
    store.put(bundle('2.0.0', 'p2').address, bundle('2.0.0', 'p2'));
    expect(store.latest('acme', 'p1')?.address.version).toBe('1.0.0');
    expect(store.latest('acme', 'p2')?.address.version).toBe('2.0.0');
  });
});

describe('FilesystemMarketplaceStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cir-mp-store-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists across instances', () => {
    const a = new FilesystemMarketplaceStore(dir);
    const b = bundle('1.0.0');
    expect(a.put(b.address, b)).toBe(true);

    const reread = new FilesystemMarketplaceStore(dir).get(b.address);
    expect(reread).toEqual(b);
  });

  it('rejects a duplicate', () => {
    const store = new FilesystemMarketplaceStore(dir);
    const b = bundle('1.0.0');
    expect(store.put(b.address, b)).toBe(true);
    expect(store.put(b.address, b)).toBe(false);
  });

  it('returns the highest semver from `latest`', () => {
    const store = new FilesystemMarketplaceStore(dir);
    store.put(bundle('1.0.0').address, bundle('1.0.0'));
    store.put(bundle('1.0.1').address, bundle('1.0.1'));
    store.put(bundle('0.9.0').address, bundle('0.9.0'));
    expect(store.latest('acme', 'p')?.address.version).toBe('1.0.1');
  });

  it('returns undefined when the author dir does not exist', () => {
    const store = new FilesystemMarketplaceStore(dir);
    expect(store.latest('nobody', 'p')).toBeUndefined();
  });
});
