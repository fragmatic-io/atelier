// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier marketplace publish <bundle.json> --author <id> --key <path>`
 *
 * Wraps `publishPersona` from `@atelier/vault-client` with a thin file-
 * loading + argv-parsing shell. The bundle JSON is the PRE-SIGNING
 * payload — the helper handles signing + POST.
 *
 * Bundle JSON shape:
 *   {
 *     "address": "atelier://acme/founder-inbox@1.0.0",  // or parsed object
 *     "payload": { ... }                                 // recipe/persona blob
 *   }
 *
 * The private key file is a PKCS#8 PEM (the standard ed25519 export
 * format from `node:crypto.generateKeyPairSync`). Tests + the docs walk
 * through generating one.
 */

/* eslint-disable no-console */

import { existsSync, readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { resolve } from 'node:path';

import { VaultClient, publishPersona } from '@atelier/vault-client';
import {
  formatMarketplaceAddress,
  parseMarketplaceAddress,
  type MarketplaceAddress,
} from '@atelier/schemas';

import { MARKETPLACE_PUBLISH_USAGE } from '../usage.js';

export interface MarketplacePublishOptions {
  /** Path to the bundle JSON file (pre-signing payload). */
  bundlePath: string;
  /** Author handle. Must match the bundle's `address.author`. */
  author: string;
  /** Path to the PKCS#8 PEM file holding the author's ed25519 private key. */
  keyPath: string;
  /** Vault base URL. Default `http://localhost:4001`. */
  vaultUrl?: string;
  /** Working directory for resolving relative paths. Defaults to `process.cwd()`. */
  cwd?: string;
  /** App ID claimed when constructing the VaultClient. Default `cir.cli`. */
  appId?: string;
  /** Override the fetcher (tests pass a stub). */
  fetcher?: typeof fetch;
}

export interface MarketplacePublishResult {
  /** Canonical `atelier://...` address the bundle was published under. */
  address: string;
}

/**
 * Programmatic entry. CLI front-end calls this; tests call it directly
 * with a stub fetcher.
 */
export async function runMarketplacePublish(
  opts: MarketplacePublishOptions,
): Promise<MarketplacePublishResult> {
  const cwd = opts.cwd ?? process.cwd();
  const bundlePath = resolve(cwd, opts.bundlePath);
  const keyPath = resolve(cwd, opts.keyPath);

  if (!existsSync(bundlePath)) {
    throw new Error(`bundle not found: ${bundlePath}`);
  }
  if (!existsSync(keyPath)) {
    throw new Error(`private key not found: ${keyPath}`);
  }

  // Parse the bundle JSON. We accept either a string `address` or a
  // parsed `MarketplaceAddress` object — the helper normalizes either.
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(bundlePath, 'utf8'));
  } catch (err) {
    throw new Error(`bundle JSON is malformed: ${(err as Error).message}`);
  }
  if (raw === null || typeof raw !== 'object') {
    throw new Error('bundle JSON must be an object with `address` and `payload` fields');
  }
  const obj = raw as { address?: unknown; payload?: unknown };
  if (obj.address === undefined) {
    throw new Error('bundle JSON missing `address` field');
  }
  const address: string | MarketplaceAddress =
    typeof obj.address === 'string' ? obj.address : (obj.address as MarketplaceAddress);

  // Extract the raw 32-byte ed25519 seed from the PEM. PKCS#8 ed25519
  // private keys end with `0x04 0x20 <32-byte seed>` (matching the
  // helper's expectation).
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

  const result = await publishPersona(
    client,
    { address, payload: obj.payload },
    { id: opts.author, privateKey },
  );
  return { address: formatMarketplaceAddress(result) };
}

/**
 * CLI front-end. Validates the argv shape, forwards to `runMarketplacePublish`,
 * prints the canonical address on success.
 */
export async function marketplacePublishCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(MARKETPLACE_PUBLISH_USAGE);
    return 0;
  }
  const bundlePath = positionals[0];
  if (bundlePath === undefined) {
    console.error('atelier marketplace publish: missing <bundle.json>');
    console.error(MARKETPLACE_PUBLISH_USAGE);
    return 1;
  }
  const author = flags['author'];
  const keyPath = flags['key'];
  if (author === undefined || author.length === 0) {
    console.error('atelier marketplace publish: --author is required');
    return 1;
  }
  if (keyPath === undefined || keyPath.length === 0) {
    console.error('atelier marketplace publish: --key is required');
    return 1;
  }

  const runOpts: MarketplacePublishOptions = {
    bundlePath,
    author,
    keyPath,
  };
  if (flags['vault-url'] !== undefined) runOpts.vaultUrl = flags['vault-url'];
  if (flags['app-id'] !== undefined) runOpts.appId = flags['app-id'];

  try {
    const result = await runMarketplacePublish(runOpts);
    console.log(result.address);
    return 0;
  } catch (err) {
    console.error(`atelier marketplace publish: ${(err as Error).message}`);
    return 1;
  }
}

/**
 * Top-level dispatcher for `atelier marketplace ...`. Today only `publish`
 * is implemented; `fetch`, `keygen`, etc. are roadmap.
 */
export async function marketplaceCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): Promise<number> {
  if (flags['help'] === 'true' && positionals.length === 0) {
    console.log(MARKETPLACE_PUBLISH_USAGE);
    return 0;
  }
  const sub = positionals[0];
  if (sub === undefined) {
    console.error("atelier marketplace: missing subcommand. Try 'atelier marketplace publish'.");
    console.error(MARKETPLACE_PUBLISH_USAGE);
    return 1;
  }
  if (sub !== 'publish') {
    console.error(
      `atelier marketplace: unknown subcommand '${sub}'. Try 'atelier marketplace publish'.`,
    );
    return 1;
  }
  return marketplacePublishCommand(positionals.slice(1), flags);
}

/**
 * Helper exported for tests + dev tooling — produces a canonical address
 * string from the bundle's `address` field without touching the wire.
 */
export function previewBundleAddress(bundleJson: unknown): string | null {
  if (bundleJson === null || typeof bundleJson !== 'object') return null;
  const obj = bundleJson as { address?: unknown };
  if (typeof obj.address === 'string') {
    const parsed = parseMarketplaceAddress(obj.address);
    return parsed === null ? null : formatMarketplaceAddress(parsed);
  }
  if (obj.address !== null && typeof obj.address === 'object') {
    const a = obj.address as MarketplaceAddress;
    if (a.scheme === 'atelier' && typeof a.author === 'string') {
      return formatMarketplaceAddress(a);
    }
  }
  return null;
}
