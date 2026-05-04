// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier marketplace review <address> --state <approved|rejected|flagged> --reviewer <id> --key <pkcs8.pem>`
 *
 * Wraps `submitReview` from `@atelier/vault-client` with a thin
 * argv-parsing + key-loading shell. Mirrors the shape of
 * `marketplace-publish.ts` (V-6.f sibling).
 *
 * The address is the `atelier://...` URI of the bundle to review. The
 * `--key` PEM is a PKCS#8 ed25519 PRIVATE key; the matching public key
 * must be registered with the vault server's `ReviewerKeyDirectory`.
 *
 * On success, prints the persisted ReviewRecord as one-line JSON. On
 * failure, prints the error and exits 1.
 */

/* eslint-disable no-console */

import { existsSync, readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { resolve } from 'node:path';

import { ReviewStateSchema, type ReviewState } from '@atelier/schemas';
import { VaultClient, submitReview } from '@atelier/vault-client';

import { MARKETPLACE_REVIEW_USAGE } from '../usage.js';

export interface MarketplaceReviewOptions {
  /** `atelier://...` address of the bundle to review. */
  address: string;
  /** Target review state: approved / rejected / flagged. (`pending` is server-only.) */
  state: ReviewState;
  /** Reviewer handle. Must match the `ReviewerKeyDirectory` entry. */
  reviewerId: string;
  /** Path to PKCS#8 PEM ed25519 private key for the reviewer. */
  keyPath: string;
  /** Optional human note attached to the review. */
  notes?: string;
  /** Vault base URL. Default `http://localhost:4001`. */
  vaultUrl?: string;
  /** Working directory for resolving relative paths. */
  cwd?: string;
  /** App ID claimed when constructing the VaultClient. Default `cir.cli`. */
  appId?: string;
  /** Override the fetcher (tests pass a stub). */
  fetcher?: typeof fetch;
}

export interface MarketplaceReviewResult {
  /** The persisted state. */
  state: ReviewState;
  /** Canonical address of the reviewed bundle. */
  address: string;
  /** Server-stamped reviewed_at timestamp. */
  reviewedAt: string | undefined;
}

/**
 * Programmatic entry. CLI front-end calls this; tests call it directly
 * with a stub fetcher.
 */
export async function runMarketplaceReview(
  opts: MarketplaceReviewOptions,
): Promise<MarketplaceReviewResult> {
  const cwd = opts.cwd ?? process.cwd();
  const keyPath = resolve(cwd, opts.keyPath);
  if (!existsSync(keyPath)) {
    throw new Error(`private key not found: ${keyPath}`);
  }
  const stateParsed = ReviewStateSchema.safeParse(opts.state);
  if (!stateParsed.success) {
    throw new Error(
      `invalid --state: '${String(opts.state)}'. Must be one of: pending, approved, rejected, flagged.`,
    );
  }

  // Extract the raw 32-byte ed25519 seed from the PKCS#8 PEM. Same
  // approach the publish command takes.
  const pem = readFileSync(keyPath, 'utf8');
  let privateKey: Uint8Array;
  try {
    const keyObj = createPrivateKey({ key: pem, format: 'pem' });
    if (keyObj.asymmetricKeyType !== 'ed25519') {
      throw new Error(
        `key file at ${keyPath} is not an ed25519 key (got ${
          keyObj.asymmetricKeyType ?? 'unknown'
        })`,
      );
    }
    const der = keyObj.export({ format: 'der', type: 'pkcs8' }) as Buffer;
    privateKey = new Uint8Array(der.subarray(der.length - 32));
  } catch (err) {
    throw new Error(`failed to load private key from ${keyPath}: ${(err as Error).message}`);
  }

  const vaultUrl = opts.vaultUrl ?? 'http://localhost:4001';
  const client = new VaultClient({
    vaultUrl,
    appId: opts.appId ?? 'cir.cli',
    ...(opts.fetcher !== undefined ? { fetcher: opts.fetcher } : {}),
  });

  const reviewArgs: Parameters<typeof submitReview>[2] = {
    state: stateParsed.data,
    reviewerId: opts.reviewerId,
    privateKey,
  };
  if (opts.notes !== undefined) reviewArgs.notes = opts.notes;
  const record = await submitReview(client, opts.address, reviewArgs);
  return {
    state: record.state,
    address: opts.address,
    reviewedAt: record.reviewed_at,
  };
}

/**
 * CLI front-end. Validates the argv shape, forwards to
 * `runMarketplaceReview`, prints the persisted state on success.
 */
export async function marketplaceReviewCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(MARKETPLACE_REVIEW_USAGE);
    return 0;
  }
  const address = positionals[0];
  if (address === undefined) {
    console.error('atelier marketplace review: missing <address>');
    console.error(MARKETPLACE_REVIEW_USAGE);
    return 1;
  }
  const state = flags['state'];
  const reviewer = flags['reviewer'];
  const keyPath = flags['key'];
  if (state === undefined || state.length === 0) {
    console.error('atelier marketplace review: --state is required');
    return 1;
  }
  if (reviewer === undefined || reviewer.length === 0) {
    console.error('atelier marketplace review: --reviewer is required');
    return 1;
  }
  if (keyPath === undefined || keyPath.length === 0) {
    console.error('atelier marketplace review: --key is required');
    return 1;
  }

  const runOpts: MarketplaceReviewOptions = {
    address,
    state: state as ReviewState,
    reviewerId: reviewer,
    keyPath,
  };
  if (flags['notes'] !== undefined) runOpts.notes = flags['notes'];
  if (flags['vault-url'] !== undefined) runOpts.vaultUrl = flags['vault-url'];
  if (flags['app-id'] !== undefined) runOpts.appId = flags['app-id'];

  try {
    const result = await runMarketplaceReview(runOpts);
    console.log(`${result.state} ${result.address}`);
    return 0;
  } catch (err) {
    console.error(`atelier marketplace review: ${(err as Error).message}`);
    return 1;
  }
}
