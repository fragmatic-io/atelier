// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `atelier marketplace review` (V-6.d CLI surface).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';

import {
  InMemoryKeyDirectory,
  InMemoryMarketplaceStore,
  InMemoryReviewStore,
  InMemoryReviewerKeyDirectory,
  computeAuthorKeyId,
  handleMarketplaceIndexRequest,
  handleMarketplacePersonaRequest,
  handleMarketplaceReviewRequest,
  type KeyDirectory,
  type MarketplaceStore,
  type ReviewStore,
  type ReviewerKeyDirectory,
} from '@atelier/vault-server';

import { signingInputForBundle, type SignedBundle } from '@atelier/schemas';

import {
  marketplaceReviewCommand,
  runMarketplaceReview,
} from '../src/commands/marketplace-review.js';
import { marketplaceCommand } from '../src/commands/marketplace-publish.js';

interface KeyMaterial {
  pem: string;
  publicKey: Uint8Array;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}

function makeKeypair(): KeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return { pem, publicKey: new Uint8Array(der.subarray(der.length - 32)), privateKey };
}

function makeBundle(authorKey: KeyMaterial, version = '1.0.0'): SignedBundle {
  const address = {
    scheme: 'atelier' as const,
    author: 'acme',
    persona: 'email-triage',
    version,
  };
  const payload = { recipe: 'inbox-zero' };
  const timestamp = '2026-05-02T12:00:00.000Z';
  const sig = nodeSign(
    null,
    Buffer.from(signingInputForBundle({ address, payload, timestamp }), 'utf8'),
    authorKey.privateKey,
  );
  return {
    address,
    payload,
    timestamp,
    signature: sig.toString('base64'),
    public_key: Buffer.from(authorKey.publicKey).toString('base64'),
    key_id: computeAuthorKeyId(authorKey.publicKey),
  };
}

function makeFetcher(
  bundleStore: MarketplaceStore,
  authorDir: KeyDirectory,
  reviewStore: ReviewStore,
  reviewerDir: ReviewerKeyDirectory,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlText =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlText);
    const method = (init?.method ?? 'GET').toUpperCase();
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    let body: unknown = null;
    if (typeof init?.body === 'string' && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const reqIn = { method, path: url.pathname, query, headers: {}, body };
    const persona = await handleMarketplacePersonaRequest(
      bundleStore,
      authorDir,
      reqIn,
      reviewStore,
    );
    if (persona !== null) {
      return new Response(persona.body !== undefined ? JSON.stringify(persona.body) : null, {
        status: persona.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const review = await handleMarketplaceReviewRequest(
      bundleStore,
      reviewStore,
      reviewerDir,
      reqIn,
    );
    if (review !== null) {
      return new Response(review.body !== undefined ? JSON.stringify(review.body) : null, {
        status: review.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const idx = await handleMarketplaceIndexRequest(bundleStore, reviewStore, reqIn);
    if (idx !== null) {
      return new Response(idx.body !== undefined ? JSON.stringify(idx.body) : null, {
        status: idx.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  };
}

describe('runMarketplaceReview', () => {
  let dir: string;
  let bundleStore: InMemoryMarketplaceStore;
  let authorDir: InMemoryKeyDirectory;
  let reviewStore: InMemoryReviewStore;
  let reviewerDir: InMemoryReviewerKeyDirectory;
  let authorKey: KeyMaterial;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cir-cli-mp-review-'));
    bundleStore = new InMemoryMarketplaceStore();
    authorDir = new InMemoryKeyDirectory();
    reviewStore = new InMemoryReviewStore();
    reviewerDir = new InMemoryReviewerKeyDirectory();
    authorKey = makeKeypair();
    authorDir.register('acme', authorKey.publicKey);
    const bundle = makeBundle(authorKey);
    bundleStore.put(bundle.address, bundle);
    reviewStore.put({
      address: bundle.address,
      state: 'pending',
      submitted_at: bundle.timestamp,
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('signs + persists a review (happy path)', async () => {
    const reviewerKey = makeKeypair();
    reviewerDir.register('maint-a', reviewerKey.publicKey);
    const keyPath = join(dir, 'maint-a.private.pem');
    writeFileSync(keyPath, reviewerKey.pem, { mode: 0o600 });

    const result = await runMarketplaceReview({
      address: 'atelier://acme/email-triage@1.0.0',
      state: 'approved',
      reviewerId: 'maint-a',
      keyPath,
      notes: 'LGTM',
      cwd: dir,
      fetcher: makeFetcher(bundleStore, authorDir, reviewStore, reviewerDir),
    });
    expect(result.state).toBe('approved');
    expect(result.address).toBe('atelier://acme/email-triage@1.0.0');
    const persisted = reviewStore.get({
      scheme: 'atelier',
      author: 'acme',
      persona: 'email-triage',
      version: '1.0.0',
    });
    expect(persisted?.state).toBe('approved');
    expect(persisted?.notes).toBe('LGTM');
  });

  it('errors clearly when the key file is missing', async () => {
    await expect(
      runMarketplaceReview({
        address: 'atelier://acme/email-triage@1.0.0',
        state: 'approved',
        reviewerId: 'maint-a',
        keyPath: join(dir, 'no-such.pem'),
        cwd: dir,
      }),
    ).rejects.toThrow(/private key not found/);
  });

  it('errors when the key is not ed25519', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
    const keyPath = join(dir, 'rsa.pem');
    writeFileSync(keyPath, pem);
    await expect(
      runMarketplaceReview({
        address: 'atelier://acme/email-triage@1.0.0',
        state: 'approved',
        reviewerId: 'maint-a',
        keyPath,
        cwd: dir,
      }),
    ).rejects.toThrow(/not an ed25519 key/);
  });

  it('errors on an invalid state', async () => {
    const reviewerKey = makeKeypair();
    const keyPath = join(dir, 'k.pem');
    writeFileSync(keyPath, reviewerKey.pem);
    await expect(
      runMarketplaceReview({
        address: 'atelier://acme/email-triage@1.0.0',
        // @ts-expect-error — the runtime check rejects the bad string.
        state: 'banned',
        reviewerId: 'maint-a',
        keyPath,
        cwd: dir,
      }),
    ).rejects.toThrow(/invalid --state/);
  });

  it('surfaces a 401 when the reviewer is not registered', async () => {
    const reviewerKey = makeKeypair(); // not registered in directory
    const keyPath = join(dir, 'rogue.pem');
    writeFileSync(keyPath, reviewerKey.pem);
    await expect(
      runMarketplaceReview({
        address: 'atelier://acme/email-triage@1.0.0',
        state: 'approved',
        reviewerId: 'maint-rogue',
        keyPath,
        cwd: dir,
        fetcher: makeFetcher(bundleStore, authorDir, reviewStore, reviewerDir),
      }),
    ).rejects.toThrow(/401/);
  });

  it('surfaces a 404 when the bundle is missing', async () => {
    const reviewerKey = makeKeypair();
    reviewerDir.register('maint-a', reviewerKey.publicKey);
    const keyPath = join(dir, 'maint-a.pem');
    writeFileSync(keyPath, reviewerKey.pem);
    await expect(
      runMarketplaceReview({
        address: 'atelier://acme/never@9.9.9',
        state: 'approved',
        reviewerId: 'maint-a',
        keyPath,
        cwd: dir,
        fetcher: makeFetcher(bundleStore, authorDir, reviewStore, reviewerDir),
      }),
    ).rejects.toThrow(/404/);
  });
});

describe('marketplaceReviewCommand argv parsing', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('prints usage on --help', async () => {
    const code = await marketplaceReviewCommand([], { help: 'true' });
    expect(code).toBe(0);
    expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('marketplace review');
  });

  it('errors when address is missing', async () => {
    const code = await marketplaceReviewCommand([], {});
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('missing <address>');
  });

  it('errors when --state is missing', async () => {
    const code = await marketplaceReviewCommand(['atelier://acme/p@1.0.0'], {
      reviewer: 'maint-a',
      key: 'k.pem',
    });
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('--state is required');
  });

  it('errors when --reviewer is missing', async () => {
    const code = await marketplaceReviewCommand(['atelier://acme/p@1.0.0'], {
      state: 'approved',
      key: 'k.pem',
    });
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain(
      '--reviewer is required',
    );
  });

  it('errors when --key is missing', async () => {
    const code = await marketplaceReviewCommand(['atelier://acme/p@1.0.0'], {
      state: 'approved',
      reviewer: 'maint-a',
    });
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('--key is required');
  });
});

describe('marketplaceCommand routes to review', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("subcommand 'review' dispatches to the review command", async () => {
    // Without flags, review will fail (missing --state etc.) — we just
    // assert it didn't fall into the unknown-subcommand branch.
    const code = await marketplaceCommand(['review'], {});
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('missing <address>');
  });
});
