// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `atelier marketplace publish` (V-6.f sign-at-publish CLI surface).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

import {
  InMemoryKeyDirectory,
  InMemoryMarketplaceStore,
  handleMarketplacePersonaRequest,
  type KeyDirectory,
  type MarketplaceStore,
} from '@atelier/vault-server';

import {
  marketplaceCommand,
  marketplacePublishCommand,
  previewBundleAddress,
  runMarketplacePublish,
} from '../src/commands/marketplace-publish.js';
import { main } from '../src/index.js';

/** Generate an ed25519 keypair + return PEM + raw public key. */
function makeKeypair(): { pem: string; publicKey: Uint8Array } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return { pem, publicKey: new Uint8Array(der.subarray(der.length - 32)) };
}

/** Build a stub fetcher that pipes through the in-memory persona handler. */
function makeFetcher(store: MarketplaceStore, directory: KeyDirectory): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlText =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlText);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown = null;
    if (typeof init?.body === 'string' && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const out = await handleMarketplacePersonaRequest(store, directory, {
      method,
      path: url.pathname,
      query: {},
      headers: {},
      body,
    });
    if (out === null) return new Response(null, { status: 404 });
    if (out.body === undefined) return new Response(null, { status: out.status });
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

describe('runMarketplacePublish', () => {
  let dir: string;
  let store: InMemoryMarketplaceStore;
  let directory: InMemoryKeyDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cir-cli-mp-'));
    store = new InMemoryMarketplaceStore();
    directory = new InMemoryKeyDirectory();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('signs + publishes a bundle (happy path)', async () => {
    const { pem, publicKey } = makeKeypair();
    directory.register('acme', publicKey);
    const keyPath = join(dir, 'acme.private.pem');
    writeFileSync(keyPath, pem, { mode: 0o600 });
    const bundlePath = join(dir, 'bundle.json');
    writeFileSync(
      bundlePath,
      JSON.stringify({
        address: 'atelier://acme/founder-inbox@1.0.0',
        payload: { recipe: { lens: 'inbox' } },
      }),
    );

    const result = await runMarketplacePublish({
      bundlePath,
      author: 'acme',
      keyPath,
      cwd: dir,
      fetcher: makeFetcher(store, directory),
    });
    expect(result.address).toBe('atelier://acme/founder-inbox@1.0.0');
    // Confirm the server stored a bundle under the expected key.
    const stored = store.get({
      scheme: 'atelier',
      author: 'acme',
      persona: 'founder-inbox',
      version: '1.0.0',
    });
    expect(stored?.payload).toEqual({ recipe: { lens: 'inbox' } });
  });

  it('errors clearly when the bundle file is missing', async () => {
    const { pem } = makeKeypair();
    const keyPath = join(dir, 'k.pem');
    writeFileSync(keyPath, pem);
    await expect(
      runMarketplacePublish({
        bundlePath: join(dir, 'no-such.json'),
        author: 'acme',
        keyPath,
        cwd: dir,
      }),
    ).rejects.toThrow(/bundle not found/);
  });

  it('errors clearly when the key file is missing', async () => {
    const bundlePath = join(dir, 'bundle.json');
    writeFileSync(bundlePath, JSON.stringify({ address: 'atelier://acme/p@1.0.0', payload: {} }));
    await expect(
      runMarketplacePublish({
        bundlePath,
        author: 'acme',
        keyPath: join(dir, 'no-key.pem'),
        cwd: dir,
      }),
    ).rejects.toThrow(/private key not found/);
  });

  it('errors when the key is not ed25519', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
    const keyPath = join(dir, 'rsa.pem');
    writeFileSync(keyPath, pem);
    const bundlePath = join(dir, 'bundle.json');
    writeFileSync(bundlePath, JSON.stringify({ address: 'atelier://acme/p@1.0.0', payload: {} }));
    await expect(
      runMarketplacePublish({ bundlePath, author: 'acme', keyPath, cwd: dir }),
    ).rejects.toThrow(/not an ed25519 key/);
  });

  it('errors when bundle JSON is malformed', async () => {
    const { pem } = makeKeypair();
    const keyPath = join(dir, 'k.pem');
    writeFileSync(keyPath, pem);
    const bundlePath = join(dir, 'bundle.json');
    writeFileSync(bundlePath, 'not-json');
    await expect(
      runMarketplacePublish({ bundlePath, author: 'acme', keyPath, cwd: dir }),
    ).rejects.toThrow(/bundle JSON is malformed/);
  });

  it('errors when bundle JSON is missing the address field', async () => {
    const { pem } = makeKeypair();
    const keyPath = join(dir, 'k.pem');
    writeFileSync(keyPath, pem);
    const bundlePath = join(dir, 'bundle.json');
    writeFileSync(bundlePath, JSON.stringify({ payload: {} }));
    await expect(
      runMarketplacePublish({ bundlePath, author: 'acme', keyPath, cwd: dir }),
    ).rejects.toThrow(/missing `address`/);
  });

  it('surfaces a 401 when the directory does not know the author', async () => {
    const { pem } = makeKeypair(); // not registered in directory
    const keyPath = join(dir, 'k.pem');
    writeFileSync(keyPath, pem);
    const bundlePath = join(dir, 'bundle.json');
    writeFileSync(bundlePath, JSON.stringify({ address: 'atelier://acme/p@1.0.0', payload: {} }));
    await expect(
      runMarketplacePublish({
        bundlePath,
        author: 'acme',
        keyPath,
        cwd: dir,
        fetcher: makeFetcher(store, directory),
      }),
    ).rejects.toThrow(/401/);
  });
});

describe('marketplacePublishCommand argv parsing', () => {
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
    const code = await marketplacePublishCommand([], { help: 'true' });
    expect(code).toBe(0);
    expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('marketplace publish');
  });

  it('errors when bundle path is missing', async () => {
    const code = await marketplacePublishCommand([], {});
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain(
      'missing <bundle.json>',
    );
  });

  it('errors when --author is missing', async () => {
    const code = await marketplacePublishCommand(['bundle.json'], { key: 'k.pem' });
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('--author is required');
  });

  it('errors when --key is missing', async () => {
    const code = await marketplacePublishCommand(['bundle.json'], { author: 'acme' });
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('--key is required');
  });
});

describe('marketplaceCommand dispatcher', () => {
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

  it('rejects an unknown subcommand', async () => {
    const code = await marketplaceCommand(['nope'], {});
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain(
      "unknown subcommand 'nope'",
    );
  });

  it('routes to publish via main()', async () => {
    const code = await main(['marketplace', '--help']);
    expect(code).toBe(0);
  });
});

describe('previewBundleAddress', () => {
  it('returns the canonical address from a string field', () => {
    expect(previewBundleAddress({ address: 'atelier://acme/p@1.0.0', payload: {} })).toBe(
      'atelier://acme/p@1.0.0',
    );
  });

  it('returns the canonical address from an object field', () => {
    expect(
      previewBundleAddress({
        address: { scheme: 'atelier', author: 'acme', persona: 'p', version: '1.0.0' },
        payload: {},
      }),
    ).toBe('atelier://acme/p@1.0.0');
  });

  it('returns null on garbage input', () => {
    expect(previewBundleAddress(null)).toBeNull();
    expect(previewBundleAddress({})).toBeNull();
    expect(previewBundleAddress({ address: 'not-atelier' })).toBeNull();
  });
});
