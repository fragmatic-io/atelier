// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for V-6.d — `/marketplace/review/...` POST + GET, and the
 * publish path's auto-create of a `pending` review record on first
 * publish.
 *
 * Drives the pure handler — no socket, mirroring `routes.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';

import {
  signingInputForBundle,
  type MarketplaceAddress,
  type ReviewState,
  type SignedBundle,
} from '@atelier/schemas';

import {
  InMemoryKeyDirectory,
  InMemoryMarketplaceStore,
  InMemoryReviewStore,
  InMemoryReviewerKeyDirectory,
  MARKETPLACE_PREFIX,
  MARKETPLACE_REVIEW_PREFIX,
  computeAuthorKeyId,
  handleMarketplacePersonaRequest,
  handleMarketplaceReviewRequest,
  signingInputForReview,
  type VaultRequest,
} from '../../src/index.js';

interface SigningKey {
  publicKey: Uint8Array;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}

function makeSigningKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return { publicKey: new Uint8Array(der.subarray(der.length - 32)), privateKey };
}

function makeBundle(key: SigningKey, version = '1.0.0'): SignedBundle {
  const address: MarketplaceAddress = {
    scheme: 'atelier',
    author: 'acme',
    persona: 'email-triage',
    version,
  };
  const payload = { recipe: 'inbox-zero' };
  const timestamp = '2026-05-02T12:00:00.000Z';
  const signingInput = signingInputForBundle({ address, payload, timestamp });
  const sigBuf = nodeSign(null, Buffer.from(signingInput, 'utf8'), key.privateKey);
  return {
    address,
    payload,
    timestamp,
    signature: sigBuf.toString('base64'),
    public_key: Buffer.from(key.publicKey).toString('base64'),
    key_id: computeAuthorKeyId(key.publicKey),
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

interface ReviewEnvelopeIn {
  state: ReviewState;
  reviewer_id: string;
  notes?: string;
  timestamp: string;
}

function buildReviewEnvelope(
  key: SigningKey,
  address: MarketplaceAddress,
  input: ReviewEnvelopeIn,
): {
  state: ReviewState;
  reviewer_id: string;
  notes?: string;
  timestamp: string;
  signature: string;
  public_key: string;
  key_id: string;
} {
  const signingArgs: Parameters<typeof signingInputForReview>[0] = {
    address,
    state: input.state,
    reviewer_id: input.reviewer_id,
    timestamp: input.timestamp,
  };
  if (input.notes !== undefined) signingArgs.notes = input.notes;
  const signingInput = signingInputForReview(signingArgs);
  const sigBuf = nodeSign(null, Buffer.from(signingInput, 'utf8'), key.privateKey);
  const out: {
    state: ReviewState;
    reviewer_id: string;
    notes?: string;
    timestamp: string;
    signature: string;
    public_key: string;
    key_id: string;
  } = {
    state: input.state,
    reviewer_id: input.reviewer_id,
    timestamp: input.timestamp,
    signature: sigBuf.toString('base64'),
    public_key: Buffer.from(key.publicKey).toString('base64'),
    key_id: computeAuthorKeyId(key.publicKey),
  };
  if (input.notes !== undefined) out.notes = input.notes;
  return out;
}

describe('publish auto-creates a pending ReviewRecord', () => {
  it('creates pending on first publish', async () => {
    const authorKey = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', authorKey.publicKey);
    const bundleStore = new InMemoryMarketplaceStore();
    const reviewStore = new InMemoryReviewStore();
    const bundle = makeBundle(authorKey);

    const res = await handleMarketplacePersonaRequest(
      bundleStore,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
      reviewStore,
    );
    expect(res?.status).toBe(201);
    const recorded = reviewStore.get(bundle.address);
    expect(recorded?.state).toBe('pending');
    expect(recorded?.submitted_at).toBe(bundle.timestamp);
    // Fresh pending records have no reviewer fields.
    expect(recorded?.reviewer_id).toBeUndefined();
    expect(recorded?.reviewed_at).toBeUndefined();
  });

  it('does NOT overwrite an existing record on a (would-be) duplicate publish', async () => {
    const authorKey = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', authorKey.publicKey);
    const bundleStore = new InMemoryMarketplaceStore();
    const reviewStore = new InMemoryReviewStore();
    const bundle = makeBundle(authorKey);

    // First publish creates the pending record.
    await handleMarketplacePersonaRequest(
      bundleStore,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
      reviewStore,
    );
    // Maintainer transitions to approved.
    const recorded = reviewStore.get(bundle.address);
    expect(recorded).toBeDefined();
    reviewStore.put({ ...recorded!, state: 'approved', reviewer_id: 'maint-a' });

    // Duplicate publish 409s — and crucially must not regress the
    // approved record back to pending.
    const second = await handleMarketplacePersonaRequest(
      bundleStore,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
      reviewStore,
    );
    expect(second?.status).toBe(409);
    expect(reviewStore.get(bundle.address)?.state).toBe('approved');
  });
});

describe('GET /marketplace/review/<a>/<p>@<v>', () => {
  it('returns 200 + the record when it exists', async () => {
    const reviewStore = new InMemoryReviewStore();
    reviewStore.put({
      address: { scheme: 'atelier', author: 'acme', persona: 'p', version: '1.0.0' },
      state: 'approved',
      submitted_at: '2026-05-02T12:00:00.000Z',
      reviewed_at: '2026-05-03T08:00:00.000Z',
      reviewer_id: 'maint-a',
    });
    const res = await handleMarketplaceReviewRequest(
      new InMemoryMarketplaceStore(),
      reviewStore,
      new InMemoryReviewerKeyDirectory(),
      req({ method: 'GET', path: `${MARKETPLACE_REVIEW_PREFIX}/acme/p@1.0.0` }),
    );
    expect(res?.status).toBe(200);
    expect(res?.body).toMatchObject({ state: 'approved', reviewer_id: 'maint-a' });
  });

  it('returns 404 when no record exists', async () => {
    const res = await handleMarketplaceReviewRequest(
      new InMemoryMarketplaceStore(),
      new InMemoryReviewStore(),
      new InMemoryReviewerKeyDirectory(),
      req({ method: 'GET', path: `${MARKETPLACE_REVIEW_PREFIX}/acme/missing@1.0.0` }),
    );
    expect(res?.status).toBe(404);
  });

  it('returns 400 on a malformed path', async () => {
    const res = await handleMarketplaceReviewRequest(
      new InMemoryMarketplaceStore(),
      new InMemoryReviewStore(),
      new InMemoryReviewerKeyDirectory(),
      req({ method: 'GET', path: `${MARKETPLACE_REVIEW_PREFIX}/no-version-here` }),
    );
    expect(res?.status).toBe(400);
  });

  it('does not match other prefixes', async () => {
    const res = await handleMarketplaceReviewRequest(
      new InMemoryMarketplaceStore(),
      new InMemoryReviewStore(),
      new InMemoryReviewerKeyDirectory(),
      req({ method: 'GET', path: '/marketplace/persona/acme/p@1.0.0' }),
    );
    expect(res).toBeNull();
  });
});

describe('POST /marketplace/review/<a>/<p>@<v>', () => {
  it('returns 200 + persists the record on a valid signed envelope', async () => {
    const authorKey = makeSigningKey();
    const reviewerKey = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', authorKey.publicKey);
    const bundleStore = new InMemoryMarketplaceStore();
    const reviewStore = new InMemoryReviewStore();
    const reviewerDir = new InMemoryReviewerKeyDirectory();
    reviewerDir.register('maint-a', reviewerKey.publicKey);
    const bundle = makeBundle(authorKey);
    // Seed: publish creates the pending record.
    await handleMarketplacePersonaRequest(
      bundleStore,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
      reviewStore,
    );

    const envelope = buildReviewEnvelope(reviewerKey, bundle.address, {
      state: 'approved',
      reviewer_id: 'maint-a',
      timestamp: '2026-05-03T08:00:00.000Z',
      notes: 'LGTM',
    });
    const fixedNow = (): string => '2026-05-03T08:00:01.000Z';
    const res = await handleMarketplaceReviewRequest(
      bundleStore,
      reviewStore,
      reviewerDir,
      req({
        method: 'POST',
        path: `${MARKETPLACE_REVIEW_PREFIX}/acme/email-triage@1.0.0`,
        body: envelope,
      }),
      fixedNow,
    );
    expect(res?.status).toBe(200);
    expect(res?.body).toMatchObject({
      state: 'approved',
      reviewer_id: 'maint-a',
      notes: 'LGTM',
      reviewed_at: fixedNow(),
      // submitted_at is preserved from the publish.
      submitted_at: bundle.timestamp,
    });
    // Persisted.
    const persisted = reviewStore.get(bundle.address);
    expect(persisted?.state).toBe('approved');
  });

  it('returns 401 when the reviewer is not in the directory', async () => {
    const authorKey = makeSigningKey();
    const reviewerKey = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', authorKey.publicKey);
    const bundleStore = new InMemoryMarketplaceStore();
    const reviewStore = new InMemoryReviewStore();
    const bundle = makeBundle(authorKey);
    await handleMarketplacePersonaRequest(
      bundleStore,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
      reviewStore,
    );

    const envelope = buildReviewEnvelope(reviewerKey, bundle.address, {
      state: 'approved',
      reviewer_id: 'maint-unregistered',
      timestamp: '2026-05-03T08:00:00.000Z',
    });
    const res = await handleMarketplaceReviewRequest(
      bundleStore,
      reviewStore,
      new InMemoryReviewerKeyDirectory(), // empty
      req({
        method: 'POST',
        path: `${MARKETPLACE_REVIEW_PREFIX}/acme/email-triage@1.0.0`,
        body: envelope,
      }),
    );
    expect(res?.status).toBe(401);
    expect(res?.body).toMatchObject({ error: 'signature verification failed' });
  });

  it('returns 401 when the signature does not match the registered reviewer key', async () => {
    const authorKey = makeSigningKey();
    const realReviewer = makeSigningKey();
    const fakeReviewer = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', authorKey.publicKey);
    const bundleStore = new InMemoryMarketplaceStore();
    const reviewStore = new InMemoryReviewStore();
    const reviewerDir = new InMemoryReviewerKeyDirectory();
    // Directory has the REAL reviewer's key, but the envelope is signed
    // with the FAKE reviewer's key.
    reviewerDir.register('maint-a', realReviewer.publicKey);
    const bundle = makeBundle(authorKey);
    await handleMarketplacePersonaRequest(
      bundleStore,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
      reviewStore,
    );
    const envelope = buildReviewEnvelope(fakeReviewer, bundle.address, {
      state: 'approved',
      reviewer_id: 'maint-a',
      timestamp: '2026-05-03T08:00:00.000Z',
    });
    const res = await handleMarketplaceReviewRequest(
      bundleStore,
      reviewStore,
      reviewerDir,
      req({
        method: 'POST',
        path: `${MARKETPLACE_REVIEW_PREFIX}/acme/email-triage@1.0.0`,
        body: envelope,
      }),
    );
    expect(res?.status).toBe(401);
  });

  it('returns 404 when the bundle does not exist', async () => {
    const reviewerKey = makeSigningKey();
    const reviewerDir = new InMemoryReviewerKeyDirectory();
    reviewerDir.register('maint-a', reviewerKey.publicKey);
    const address: MarketplaceAddress = {
      scheme: 'atelier',
      author: 'acme',
      persona: 'never',
      version: '9.9.9',
    };
    const envelope = buildReviewEnvelope(reviewerKey, address, {
      state: 'approved',
      reviewer_id: 'maint-a',
      timestamp: '2026-05-03T08:00:00.000Z',
    });
    const res = await handleMarketplaceReviewRequest(
      new InMemoryMarketplaceStore(),
      new InMemoryReviewStore(),
      reviewerDir,
      req({
        method: 'POST',
        path: `${MARKETPLACE_REVIEW_PREFIX}/acme/never@9.9.9`,
        body: envelope,
      }),
    );
    expect(res?.status).toBe(404);
  });

  it('returns 400 on a missing/invalid state', async () => {
    const authorKey = makeSigningKey();
    const directory = new InMemoryKeyDirectory();
    directory.register('acme', authorKey.publicKey);
    const bundleStore = new InMemoryMarketplaceStore();
    const reviewStore = new InMemoryReviewStore();
    const bundle = makeBundle(authorKey);
    await handleMarketplacePersonaRequest(
      bundleStore,
      directory,
      req({ method: 'POST', path: MARKETPLACE_PREFIX, body: bundle }),
      reviewStore,
    );
    const res = await handleMarketplaceReviewRequest(
      bundleStore,
      reviewStore,
      new InMemoryReviewerKeyDirectory(),
      req({
        method: 'POST',
        path: `${MARKETPLACE_REVIEW_PREFIX}/acme/email-triage@1.0.0`,
        body: {
          reviewer_id: 'm',
          timestamp: 't',
          signature: 's',
          public_key: 'p',
          key_id: '0123456789abcdef',
        },
      }),
    );
    expect(res?.status).toBe(400);
  });
});
