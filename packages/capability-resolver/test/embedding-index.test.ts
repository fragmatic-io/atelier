// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `InMemoryEmbeddingIndex` + `cosineSimilarity`.
 *
 *   - cosine math correctness on hand-rolled vectors
 *   - build via per-call embed (no batch)
 *   - build via batch embed (chunked)
 *   - topK ordering by cosine similarity
 *   - serialize → load round-trip yields identical query results
 *   - dimension mismatch and empty-vector errors
 *   - load() rejects malformed payloads
 *   - empty index returns []
 */

import type { Capability } from '@atelier/schemas';
import { describe, expect, it } from 'vitest';
import {
  InMemoryEmbeddingIndex,
  cosineSimilarity,
  type EmbeddingClient,
} from '../src/embedding-index.js';

function cap(id: string, description: string): Capability {
  return { id, kind: 'data', version: '1.0.0', description } as unknown as Capability;
}

/**
 * Deterministic mock embedding client. Each capability text gets a
 * fixed pre-scripted vector so we can assert specific orderings.
 */
function scriptedClient(table: Record<string, readonly number[]>): EmbeddingClient {
  return {
    id: 'mock-embed',
    embed: async (text) => {
      const v = table[text];
      if (!v) throw new Error(`scriptedClient: no vector for "${text}"`);
      return Promise.resolve(v);
    },
  };
}

function batchClient(table: Record<string, readonly number[]>, calls: number[]): EmbeddingClient {
  return {
    id: 'mock-batch',
    embed: async (text) => {
      const v = table[text];
      if (!v) throw new Error(`batchClient: no vector for "${text}"`);
      return Promise.resolve(v);
    },
    embedBatch: async (texts) => {
      calls.push(texts.length);
      const out: (readonly number[])[] = [];
      for (const t of texts) {
        const v = table[t];
        if (!v) throw new Error(`batchClient: no vector for "${t}"`);
        out.push(v);
      }
      return Promise.resolve(out);
    },
  };
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([0.5, 0.5, 0.5], [0.5, 0.5, 0.5])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([0, 1], [1, 0])).toBeCloseTo(0, 6);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
  });

  it('is invariant under positive scaling', () => {
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([3, 4], [6, 8])).toBeCloseTo(1, 6);
  });

  it('returns 0 on zero-magnitude or length mismatch (no NaN)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [0, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('matches the closed-form value for a non-trivial pair', () => {
    // a=(1,2,3), b=(2,3,4); dot=2+6+12=20; |a|=sqrt(14); |b|=sqrt(29)
    // cos = 20 / sqrt(14*29) = 20 / sqrt(406) ≈ 0.99258333
    expect(cosineSimilarity([1, 2, 3], [2, 3, 4])).toBeCloseTo(20 / Math.sqrt(406), 6);
  });
});

describe('InMemoryEmbeddingIndex.build', () => {
  it('embeds via per-call when embedBatch is absent', async () => {
    const c = scriptedClient({
      'a: A description': [1, 0, 0],
      'b: B description': [0, 1, 0],
    });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([cap('a', 'A description'), cap('b', 'B description')], c);
    expect(idx.size()).toBe(2);
    expect(idx.dimension()).toBe(3);
  });

  it('uses embedBatch in chunks when present', async () => {
    const calls: number[] = [];
    const c = batchClient(
      {
        'a: x': [1, 0],
        'b: x': [0, 1],
        'c: x': [1, 1],
        'd: x': [1, -1],
        'e: x': [-1, 0],
      },
      calls,
    );
    const idx = new InMemoryEmbeddingIndex({ batchSize: 2 });
    await idx.build([cap('a', 'x'), cap('b', 'x'), cap('c', 'x'), cap('d', 'x'), cap('e', 'x')], c);
    expect(idx.size()).toBe(5);
    // 5 inputs, batchSize=2 → chunks of [2, 2, 1]
    expect(calls).toEqual([2, 2, 1]);
  });

  it('falls back to id alone when description is empty', async () => {
    const c = scriptedClient({ naked: [1, 0] });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([{ id: 'naked', kind: 'data', version: '1.0.0' } as unknown as Capability], c);
    expect(idx.size()).toBe(1);
  });

  it('throws on dimension mismatch across vectors', async () => {
    const c = scriptedClient({
      'a: x': [1, 0, 0],
      'b: x': [1, 0], // wrong dimension
    });
    const idx = new InMemoryEmbeddingIndex();
    await expect(idx.build([cap('a', 'x'), cap('b', 'x')], c)).rejects.toThrow(
      /dimension mismatch/,
    );
  });

  it('throws when the first vector is empty', async () => {
    const c = scriptedClient({ 'a: x': [] });
    const idx = new InMemoryEmbeddingIndex();
    await expect(idx.build([cap('a', 'x')], c)).rejects.toThrow(/empty vector/);
  });

  it('build([]) yields an empty index without error', async () => {
    const c = scriptedClient({});
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([], c);
    expect(idx.size()).toBe(0);
    expect(idx.dimension()).toBe(0);
  });

  it('rebuild replaces previous state', async () => {
    const c1 = scriptedClient({ 'a: A': [1, 0] });
    const c2 = scriptedClient({ 'b: B': [0, 1, 0] });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([cap('a', 'A')], c1);
    expect(idx.dimension()).toBe(2);
    await idx.build([cap('b', 'B')], c2);
    expect(idx.dimension()).toBe(3);
    expect(idx.size()).toBe(1);
  });

  it('rejects when embedBatch returns wrong length', async () => {
    const c: EmbeddingClient = {
      id: 'broken',
      embed: async () => Promise.resolve([0]),
      embedBatch: async () => Promise.resolve([[1, 0]]),
    };
    const idx = new InMemoryEmbeddingIndex();
    await expect(idx.build([cap('a', 'x'), cap('b', 'x')], c)).rejects.toThrow(
      /returned 1 vectors for 2 inputs/,
    );
  });
});

describe('InMemoryEmbeddingIndex.topK', () => {
  it('ranks by cosine similarity (descending)', async () => {
    // Query (1,0). Capability vectors:
    //  a → (1,0)    cos=1
    //  b → (0.7,0.3) cos≈0.919
    //  c → (0,1)    cos=0
    //  d → (-1,0)   cos=-1
    const c = scriptedClient({
      'a: a': [1, 0],
      'b: b': [0.7, 0.3],
      'c: c': [0, 1],
      'd: d': [-1, 0],
    });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([cap('a', 'a'), cap('b', 'b'), cap('c', 'c'), cap('d', 'd')], c);
    const hits = idx.topK([1, 0], 4);
    expect(hits.map((h) => h.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(hits[0]?.score).toBeCloseTo(1, 6);
    expect(hits[3]?.score).toBeCloseTo(-1, 6);
  });

  it('clamps result to k', async () => {
    const c = scriptedClient({
      'a: a': [1, 0],
      'b: b': [0, 1],
      'c: c': [1, 1],
    });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([cap('a', 'a'), cap('b', 'b'), cap('c', 'c')], c);
    expect(idx.topK([1, 0], 2)).toHaveLength(2);
    expect(idx.topK([1, 0], 99)).toHaveLength(3);
  });

  it('returns [] for k<=0', async () => {
    const c = scriptedClient({ 'a: a': [1, 0] });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([cap('a', 'a')], c);
    expect(idx.topK([1, 0], 0)).toEqual([]);
    expect(idx.topK([1, 0], -3)).toEqual([]);
  });

  it('returns [] when query dimension mismatches', async () => {
    const c = scriptedClient({ 'a: a': [1, 0, 0] });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([cap('a', 'a')], c);
    expect(idx.topK([1, 0], 5)).toEqual([]);
  });

  it('returns [] when index is empty', () => {
    const idx = new InMemoryEmbeddingIndex();
    expect(idx.topK([1, 0], 5)).toEqual([]);
  });

  it('returns [] for zero-magnitude query (no NaN scores)', async () => {
    const c = scriptedClient({ 'a: a': [1, 0] });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([cap('a', 'a')], c);
    expect(idx.topK([0, 0], 5)).toEqual([]);
  });

  it('breaks ties by insertion order', async () => {
    const c = scriptedClient({
      'a: a': [1, 0],
      'b: b': [1, 0], // identical vector → identical score
      'c: c': [0, 1],
    });
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([cap('a', 'a'), cap('b', 'b'), cap('c', 'c')], c);
    const hits = idx.topK([1, 0], 3);
    expect(hits[0]?.id).toBe('a');
    expect(hits[1]?.id).toBe('b');
  });
});

describe('InMemoryEmbeddingIndex serialize/load', () => {
  it('round-trips: load yields identical topK results', async () => {
    const c = scriptedClient({
      'a: a': [1, 0, 0],
      'b: b': [0, 1, 0],
      'c: c': [0, 0, 1],
    });
    const a = new InMemoryEmbeddingIndex();
    await a.build([cap('a', 'a'), cap('b', 'b'), cap('c', 'c')], c);
    const blob = a.serialize();

    const b = new InMemoryEmbeddingIndex();
    b.load(blob);

    expect(b.size()).toBe(a.size());
    expect(b.dimension()).toBe(a.dimension());

    const query = [0.7, 0.5, 0.5];
    const ha = a.topK(query, 3);
    const hb = b.topK(query, 3);
    expect(hb.map((h) => h.id)).toEqual(ha.map((h) => h.id));
    for (let i = 0; i < ha.length; i++) {
      expect(hb[i]?.score).toBeCloseTo(ha[i]?.score ?? 0, 6);
    }
  });

  it('serialize() of empty index round-trips', () => {
    const a = new InMemoryEmbeddingIndex();
    const blob = a.serialize();
    const b = new InMemoryEmbeddingIndex();
    b.load(blob);
    expect(b.size()).toBe(0);
    expect(b.dimension()).toBe(0);
  });

  it('load() rejects invalid JSON', () => {
    const idx = new InMemoryEmbeddingIndex();
    expect(() => idx.load('{not json')).toThrow(/invalid JSON/);
  });

  it('load() rejects unsupported version', () => {
    const idx = new InMemoryEmbeddingIndex();
    expect(() => idx.load(JSON.stringify({ v: 99, dimension: 1, ids: [], vectors: '' }))).toThrow(
      /unsupported version/,
    );
  });

  it('load() rejects vector/ids length mismatch', () => {
    const idx = new InMemoryEmbeddingIndex();
    // 1 id, dimension 2 → expects 2 floats = 8 bytes; supply 0.
    expect(() => idx.load(JSON.stringify({ v: 1, dimension: 2, ids: ['a'], vectors: '' }))).toThrow(
      /vectors length/,
    );
  });

  it('load() rejects non-string ids', () => {
    const idx = new InMemoryEmbeddingIndex();
    expect(() => idx.load(JSON.stringify({ v: 1, dimension: 1, ids: [42], vectors: '' }))).toThrow(
      /ids must be strings/,
    );
  });

  it('load() rejects non-object payloads', () => {
    const idx = new InMemoryEmbeddingIndex();
    expect(() => idx.load('null')).toThrow(/expected an object/);
  });
});
