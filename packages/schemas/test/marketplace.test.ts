// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
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
  it('parses canonical atelier:// addresses', () => {
    const out = parseMarketplaceAddress('atelier://aurora-labs/email-triage@1.0.0');
    expect(out).toEqual({
      scheme: 'atelier',
      author: 'aurora-labs',
      persona: 'email-triage',
      version: '1.0.0',
    });
  });

  it('parses pre-release semver versions', () => {
    const out = parseMarketplaceAddress('atelier://acme/recipe@2.1.0-rc.1');
    expect(out?.version).toBe('2.1.0-rc.1');
  });

  it('captures ?signed_by= for explicit pinning', () => {
    const out = parseMarketplaceAddress('atelier://acme/recipe@1.0.0?signed_by=0123456789abcdef');
    expect(out?.signed_by).toBe('0123456789abcdef');
  });

  it('returns null on missing scheme', () => {
    expect(parseMarketplaceAddress('acme/recipe@1.0.0')).toBeNull();
  });

  it('returns null on malformed semver', () => {
    expect(parseMarketplaceAddress('atelier://acme/recipe@not-a-version')).toBeNull();
  });

  it('returns null on uppercase author', () => {
    expect(parseMarketplaceAddress('atelier://Acme/recipe@1.0.0')).toBeNull();
  });

  it('returns null on bad signed_by fingerprint', () => {
    expect(
      parseMarketplaceAddress('atelier://acme/recipe@1.0.0?signed_by=NOT_HEX_xxxxxxxxx'),
    ).toBeNull();
  });

  it('round-trips through formatMarketplaceAddress', () => {
    const uri = 'atelier://acme/recipe@1.2.3';
    const parsed = parseMarketplaceAddress(uri);
    expect(parsed).not.toBeNull();
    expect(formatMarketplaceAddress(parsed!)).toBe(uri);
  });

  it('round-trips with signed_by', () => {
    const uri = 'atelier://acme/recipe@1.2.3?signed_by=0123456789abcdef';
    const parsed = parseMarketplaceAddress(uri);
    expect(parsed).not.toBeNull();
    expect(formatMarketplaceAddress(parsed!)).toBe(uri);
  });
});

describe('MarketplaceAddressSchema', () => {
  it('accepts a parsed address', () => {
    const addr = parseMarketplaceAddress('atelier://acme/recipe@1.0.0');
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

  it('emits null for top-level undefined / function / symbol', () => {
    expect(canonicalJsonStringify(undefined)).toBe('null');
    expect(canonicalJsonStringify(() => undefined)).toBe('null');
    expect(canonicalJsonStringify(Symbol('s'))).toBe('null');
  });

  it('emits null for arrays containing undefined / function / symbol', () => {
    const out = canonicalJsonStringify([1, undefined, () => undefined, Symbol('s'), 2]);
    expect(out).toBe('[1,null,null,null,2]');
  });

  it('skips undefined / function / symbol object values', () => {
    const out = canonicalJsonStringify({
      a: 1,
      b: undefined,
      c: () => undefined,
      d: Symbol('s'),
      e: 2,
    });
    // b/c/d dropped; only a, e remain.
    expect(out).toBe('{"a":1,"e":2}');
  });

  it('round-trips strings, booleans, and null', () => {
    expect(canonicalJsonStringify('hi')).toBe('"hi"');
    expect(canonicalJsonStringify(true)).toBe('true');
    expect(canonicalJsonStringify(false)).toBe('false');
    expect(canonicalJsonStringify(null)).toBe('null');
  });
});

describe('signingInputForBundle', () => {
  it('strips signed_by before signing', () => {
    const ts = '2026-05-02T12:00:00.000Z';
    const withPin = signingInputForBundle({
      address: {
        scheme: 'atelier',
        author: 'acme',
        persona: 'recipe',
        version: '1.0.0',
        signed_by: '0123456789abcdef',
      },
      payload: { hello: 'world' },
      timestamp: ts,
    });
    const withoutPin = signingInputForBundle({
      address: { scheme: 'atelier', author: 'acme', persona: 'recipe', version: '1.0.0' },
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
        scheme: 'atelier' as const,
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
        scheme: 'atelier' as const,
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
