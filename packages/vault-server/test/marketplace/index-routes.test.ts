// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for V-6.d — `GET /marketplace/index`. Default index returns
 * approved-only; `?include=` is the maintainer escape hatch.
 */
import { describe, expect, it } from 'vitest';

import type { MarketplaceAddress, ReviewRecord, SignedBundle } from '@atelier/schemas';

import {
  InMemoryMarketplaceStore,
  InMemoryReviewStore,
  MARKETPLACE_INDEX_PATH,
  handleMarketplaceIndexRequest,
  type MarketplaceListingWire,
  type VaultRequest,
} from '../../src/index.js';

function addr(version: string, persona = 'p', author = 'acme'): MarketplaceAddress {
  return { scheme: 'atelier', author, persona, version };
}

function bundle(version: string, payload: Record<string, unknown> = {}): SignedBundle {
  return {
    address: addr(version),
    payload: { description: `desc-${version}`, ...payload },
    timestamp: `2026-05-0${version[0] ?? '1'}T12:00:00.000Z`,
    signature: 'AAAA',
    public_key: 'BBBB',
    key_id: '0123456789abcdef',
  };
}

function record(state: ReviewRecord['state'], version: string): ReviewRecord {
  return {
    address: addr(version),
    state,
    submitted_at: '2026-05-02T12:00:00.000Z',
  };
}

function req(opts: Partial<VaultRequest> & { method: string; path: string }): VaultRequest {
  return {
    method: opts.method,
    path: opts.path,
    query: opts.query ?? {},
    headers: opts.headers ?? {},
    body: opts.body ?? null,
  };
}

function seed(
  bundles: SignedBundle[],
  records: ReviewRecord[],
): { bundleStore: InMemoryMarketplaceStore; reviewStore: InMemoryReviewStore } {
  const bundleStore = new InMemoryMarketplaceStore();
  const reviewStore = new InMemoryReviewStore();
  for (const b of bundles) bundleStore.put(b.address, b);
  for (const r of records) reviewStore.put(r);
  return { bundleStore, reviewStore };
}

describe('GET /marketplace/index — default (approved-only)', () => {
  it('returns only approved listings', async () => {
    const { bundleStore, reviewStore } = seed(
      [bundle('1.0.0'), bundle('2.0.0'), bundle('3.0.0')],
      [record('approved', '1.0.0'), record('pending', '2.0.0'), record('rejected', '3.0.0')],
    );
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH }),
    );
    expect(res?.status).toBe(200);
    const body = res?.body as MarketplaceListingWire[];
    expect(body.length).toBe(1);
    expect(body[0]?.address.version).toBe('1.0.0');
    expect(body[0]?.reviewState).toBe('approved');
  });

  it('returns an empty array when no approved records exist', async () => {
    const { bundleStore, reviewStore } = seed([bundle('1.0.0')], [record('pending', '1.0.0')]);
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH }),
    );
    expect(res?.status).toBe(200);
    expect(res?.body).toEqual([]);
  });
});

describe('GET /marketplace/index?include=...', () => {
  it('include=pending shows pending bundles', async () => {
    const { bundleStore, reviewStore } = seed(
      [bundle('1.0.0'), bundle('2.0.0')],
      [record('approved', '1.0.0'), record('pending', '2.0.0')],
    );
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH, query: { include: 'pending' } }),
    );
    const body = res?.body as MarketplaceListingWire[];
    expect(body.map((l) => l.reviewState)).toEqual(['pending']);
  });

  it('include=pending,approved shows both', async () => {
    const { bundleStore, reviewStore } = seed(
      [bundle('1.0.0'), bundle('2.0.0'), bundle('3.0.0')],
      [record('approved', '1.0.0'), record('pending', '2.0.0'), record('flagged', '3.0.0')],
    );
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({
        method: 'GET',
        path: MARKETPLACE_INDEX_PATH,
        query: { include: 'pending,approved' },
      }),
    );
    const body = res?.body as MarketplaceListingWire[];
    expect(body.length).toBe(2);
    const states = body.map((l) => l.reviewState).sort();
    expect(states).toEqual(['approved', 'pending']);
  });

  it('falls back to approved-only when every include= value is invalid', async () => {
    const { bundleStore, reviewStore } = seed(
      [bundle('1.0.0'), bundle('2.0.0')],
      [record('approved', '1.0.0'), record('pending', '2.0.0')],
    );
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH, query: { include: 'banned,unknown' } }),
    );
    const body = res?.body as MarketplaceListingWire[];
    expect(body.length).toBe(1);
    expect(body[0]?.reviewState).toBe('approved');
  });
});

describe('GET /marketplace/index — filters', () => {
  it('filters by author', async () => {
    const acmeBundle = bundle('1.0.0');
    const auroraBundle: SignedBundle = {
      ...bundle('1.0.0'),
      address: { ...addr('1.0.0'), author: 'aurora' },
    };
    const { bundleStore, reviewStore } = seed(
      [acmeBundle, auroraBundle],
      [
        record('approved', '1.0.0'),
        { ...record('approved', '1.0.0'), address: auroraBundle.address },
      ],
    );
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH, query: { author: 'aurora' } }),
    );
    const body = res?.body as MarketplaceListingWire[];
    expect(body.length).toBe(1);
    expect(body[0]?.address.author).toBe('aurora');
  });

  it('filters by domain (read from payload)', async () => {
    const { bundleStore, reviewStore } = seed(
      [bundle('1.0.0', { domain: 'productivity' }), bundle('2.0.0', { domain: 'design' })],
      [record('approved', '1.0.0'), record('approved', '2.0.0')],
    );
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH, query: { domain: 'design' } }),
    );
    const body = res?.body as MarketplaceListingWire[];
    expect(body.length).toBe(1);
    expect(body[0]?.domain).toBe('design');
  });

  it('search matches persona / description / authorDisplayName', async () => {
    const acmeBundle = bundle('1.0.0', { description: 'Inbox lens' });
    const auroraBundle: SignedBundle = {
      ...bundle('2.0.0', {
        description: 'Canvas thing',
        author_display_name: 'Aurora Labs',
      }),
      address: { ...addr('2.0.0'), author: 'aurora' },
    };
    const { bundleStore, reviewStore } = seed(
      [acmeBundle, auroraBundle],
      [
        record('approved', '1.0.0'),
        { ...record('approved', '2.0.0'), address: auroraBundle.address },
      ],
    );
    const r1 = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH, query: { search: 'inbox' } }),
    );
    expect((r1?.body as MarketplaceListingWire[]).length).toBe(1);
    const r2 = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH, query: { search: 'aurora' } }),
    );
    expect((r2?.body as MarketplaceListingWire[]).length).toBe(1);
  });

  it('respects limit + offset', async () => {
    const { bundleStore, reviewStore } = seed(
      [bundle('1.0.0'), bundle('2.0.0'), bundle('3.0.0')],
      [record('approved', '1.0.0'), record('approved', '2.0.0'), record('approved', '3.0.0')],
    );
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({
        method: 'GET',
        path: MARKETPLACE_INDEX_PATH,
        query: { limit: '2', offset: '1' },
      }),
    );
    const body = res?.body as MarketplaceListingWire[];
    expect(body.length).toBe(2);
  });

  it('does not match other paths', async () => {
    const res = await handleMarketplaceIndexRequest(
      new InMemoryMarketplaceStore(),
      new InMemoryReviewStore(),
      req({ method: 'GET', path: '/marketplace/persona/acme/p@1.0.0' }),
    );
    expect(res).toBeNull();
  });

  it('does not match non-GET methods', async () => {
    const res = await handleMarketplaceIndexRequest(
      new InMemoryMarketplaceStore(),
      new InMemoryReviewStore(),
      req({ method: 'POST', path: MARKETPLACE_INDEX_PATH, body: {} }),
    );
    expect(res).toBeNull();
  });
});

describe('GET /marketplace/index — payload field shape (snake vs camel)', () => {
  it('reads brandKitId AND brand_kit_id', async () => {
    const camel = bundle('1.0.0', { brandKitId: 'acme-default' });
    const snake = bundle('2.0.0', { brand_kit_id: 'aurora-light' });
    const { bundleStore, reviewStore } = seed(
      [camel, snake],
      [record('approved', '1.0.0'), record('approved', '2.0.0')],
    );
    const res = await handleMarketplaceIndexRequest(
      bundleStore,
      reviewStore,
      req({ method: 'GET', path: MARKETPLACE_INDEX_PATH }),
    );
    const body = res?.body as MarketplaceListingWire[];
    const v1 = body.find((l) => l.address.version === '1.0.0');
    const v2 = body.find((l) => l.address.version === '2.0.0');
    expect(v1?.brandKitId).toBe('acme-default');
    expect(v2?.brandKitId).toBe('aurora-light');
  });
});
