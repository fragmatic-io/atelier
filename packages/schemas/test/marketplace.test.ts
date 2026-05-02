// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import {
  MarketplaceAddressSchema,
  SignedBundleSchema,
  canonicalJsonStringify,
  formatMarketplaceAddress,
  parseMarketplaceAddress,
  signingInputForBundle,
} from '../src/marketplace.js';

describe('parseMarketplaceAddress', () => {
  it('parses canonical cir:// addresses', () => {
    const out = parseMarketplaceAddress('cir://aurora-labs/email-triage@1.0.0');
    expect(out).toEqual({
      scheme: 'cir',
      author: 'aurora-labs',
      persona: 'email-triage',
      version: '1.0.0',
    });
  });

  it('parses pre-release semver versions', () => {
    const out = parseMarketplaceAddress('cir://acme/recipe@2.1.0-rc.1');
    expect(out?.version).toBe('2.1.0-rc.1');
  });

  it('captures ?signed_by= for explicit pinning', () => {
    const out = parseMarketplaceAddress('cir://acme/recipe@1.0.0?signed_by=0123456789abcdef');
    expect(out?.signed_by).toBe('0123456789abcdef');
  });

  it('returns null on missing scheme', () => {
    expect(parseMarketplaceAddress('acme/recipe@1.0.0')).toBeNull();
  });

  it('returns null on malformed semver', () => {
    expect(parseMarketplaceAddress('cir://acme/recipe@not-a-version')).toBeNull();
  });

  it('returns null on uppercase author', () => {
    expect(parseMarketplaceAddress('cir://Acme/recipe@1.0.0')).toBeNull();
  });

  it('returns null on bad signed_by fingerprint', () => {
    expect(
      parseMarketplaceAddress('cir://acme/recipe@1.0.0?signed_by=NOT_HEX_xxxxxxxxx'),
    ).toBeNull();
  });

  it('round-trips through formatMarketplaceAddress', () => {
    const uri = 'cir://acme/recipe@1.2.3';
    const parsed = parseMarketplaceAddress(uri);
    expect(parsed).not.toBeNull();
    expect(formatMarketplaceAddress(parsed!)).toBe(uri);
  });

  it('round-trips with signed_by', () => {
    const uri = 'cir://acme/recipe@1.2.3?signed_by=0123456789abcdef';
    const parsed = parseMarketplaceAddress(uri);
    expect(parsed).not.toBeNull();
    expect(formatMarketplaceAddress(parsed!)).toBe(uri);
  });
});

describe('MarketplaceAddressSchema', () => {
  it('accepts a parsed address', () => {
    const addr = parseMarketplaceAddress('cir://acme/recipe@1.0.0');
    expect(MarketplaceAddressSchema.safeParse(addr).success).toBe(true);
  });

  it('rejects non-cir scheme', () => {
    const out = MarketplaceAddressSchema.safeParse({
      scheme: 'http',
      author: 'acme',
      persona: 'recipe',
      version: '1.0.0',
    });
    expect(out.success).toBe(false);
  });
});

describe('canonicalJsonStringify', () => {
  it('sorts object keys lexicographically', () => {
    const out = canonicalJsonStringify({ b: 1, a: 2, c: 3 });
    expect(out).toBe('{"a":2,"b":1,"c":3}');
  });

  it('sorts nested object keys', () => {
    const out = canonicalJsonStringify({ z: { d: 1, c: 2 }, a: [3, 1, 2] });
    expect(out).toBe('{"a":[3,1,2],"z":{"c":2,"d":1}}');
  });

  it('preserves array order', () => {
    expect(canonicalJsonStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('omits undefined object values', () => {
    expect(canonicalJsonStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('emits null for non-finite numbers', () => {
    expect(canonicalJsonStringify({ a: NaN, b: Infinity })).toBe('{"a":null,"b":null}');
  });

  it('produces identical output for differently-ordered same-content objects', () => {
    const a = { x: 1, y: { b: 2, a: 1 } };
    const b = { y: { a: 1, b: 2 }, x: 1 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });
});

describe('signingInputForBundle', () => {
  it('strips signed_by before signing', () => {
    const ts = '2026-05-02T12:00:00.000Z';
    const withPin = signingInputForBundle({
      address: {
        scheme: 'cir',
        author: 'acme',
        persona: 'recipe',
        version: '1.0.0',
        signed_by: '0123456789abcdef',
      },
      payload: { hello: 'world' },
      timestamp: ts,
    });
    const withoutPin = signingInputForBundle({
      address: { scheme: 'cir', author: 'acme', persona: 'recipe', version: '1.0.0' },
      payload: { hello: 'world' },
      timestamp: ts,
    });
    expect(withPin).toBe(withoutPin);
  });
});

describe('SignedBundleSchema', () => {
  it('accepts a well-formed bundle', () => {
    const bundle = {
      address: {
        scheme: 'cir' as const,
        author: 'acme',
        persona: 'recipe',
        version: '1.0.0',
      },
      payload: { hello: 'world' },
      timestamp: '2026-05-02T00:00:00.000Z',
      signature: 'aGVsbG8=',
      public_key: 'cHViYmluYXJ5',
      key_id: '0123456789abcdef',
    };
    expect(SignedBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it('rejects a short key_id', () => {
    const bundle = {
      address: {
        scheme: 'cir' as const,
        author: 'acme',
        persona: 'recipe',
        version: '1.0.0',
      },
      payload: {},
      timestamp: '2026-05-02T00:00:00.000Z',
      signature: 'sig',
      public_key: 'pk',
      key_id: 'short',
    };
    expect(SignedBundleSchema.safeParse(bundle).success).toBe(false);
  });
});
