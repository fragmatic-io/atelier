// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `InMemoryEmbeddingIndex` + `cosineSimilarity`. Same coverage
 * shape as the parallel test in `@atelier/capability-resolver`. We
 * duplicate the small math test surface here because the package ships
 * its own copy of the index (see `embedding-index.ts` for why).
 */

import { describe, expect, it } from 'vitest';
import {
  InMemoryEmbeddingIndex,
  cosineSimilarity,
  type EmbeddingClient,
} from '../src/embedding-index.js';

function entry(id: string, text: string): { id: string; text: string } {
  return { id, text };
}

function scriptedClient(table: Record<string, readonly number[]>): EmbeddingClient {
  return {
    id: 'mock',
    embed: async (text) => {
      const v = table[text];
      if (!v) throw new Error(`no vector for "${text}"`);
      return Promise.resolve(v);
    },
  };
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal / mismatched / zero', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
  });
});

describe('InMemoryEmbeddingIndex', () => {
  it('builds via per-call embed when embedBatch is absent', async () => {
    const idx = new InMemoryEmbeddingIndex();
    await idx.build(
      [entry('a', 'a-text'), entry('b', 'b-text')],
      scriptedClient({ 'a-text': [1, 0], 'b-text': [0, 1] }),
    );
    expect(idx.size()).toBe(2);
    expect(idx.dimension()).toBe(2);
  });

  it('builds via embedBatch in chunks when present', async () => {
    const calls: number[] = [];
    const c: EmbeddingClient = {
      id: 'batch',
      embed: async () => Promise.resolve([0, 0]),
      embedBatch: async (texts) => {
        calls.push(texts.length);
        return Promise.resolve(texts.map(() => [1, 0] as readonly number[]));
      },
    };
    const idx = new InMemoryEmbeddingIndex({ batchSize: 2 });
    await idx.build([entry('a', 'x'), entry('b', 'x'), entry('c', 'x')], c);
    expect(calls).toEqual([2, 1]);
  });

  it('topK ranks by cosine similarity', async () => {
    const idx = new InMemoryEmbeddingIndex();
    await idx.build(
      [entry('a', 'a'), entry('b', 'b'), entry('c', 'c')],
      scriptedClient({ a: [1, 0], b: [0.7, 0.3], c: [0, 1] }),
    );
    const hits = idx.topK([1, 0], 3);
    expect(hits.map((h) => h.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for empty index / k<=0 / dim mismatch / zero query', async () => {
    const idx = new InMemoryEmbeddingIndex();
    expect(idx.topK([1, 0], 5)).toEqual([]);
    await idx.build([entry('a', 'a')], scriptedClient({ a: [1, 0] }));
    expect(idx.topK([1, 0], 0)).toEqual([]);
    expect(idx.topK([1, 0, 0], 5)).toEqual([]);
    expect(idx.topK([0, 0], 5)).toEqual([]);
  });

  it('build([]) yields an empty index without error', async () => {
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([], scriptedClient({}));
    expect(idx.size()).toBe(0);
  });

  it('rejects dimension mismatch and empty vectors', async () => {
    const idx = new InMemoryEmbeddingIndex();
    await expect(
      idx.build([entry('a', 'a'), entry('b', 'b')], scriptedClient({ a: [1, 0, 0], b: [1, 0] })),
    ).rejects.toThrow(/dimension mismatch/);
    await expect(
      new InMemoryEmbeddingIndex().build([entry('a', 'a')], scriptedClient({ a: [] })),
    ).rejects.toThrow(/empty vector/);
  });

  it('rejects when embedBatch returns wrong length', async () => {
    const c: EmbeddingClient = {
      id: 'broken',
      embed: async () => Promise.resolve([0]),
      embedBatch: async () => Promise.resolve([[1, 0]]),
    };
    const idx = new InMemoryEmbeddingIndex();
    await expect(idx.build([entry('a', 'x'), entry('b', 'x')], c)).rejects.toThrow(
      /returned 1 vectors for 2 inputs/,
    );
  });

  it('breaks ties by insertion order', async () => {
    const idx = new InMemoryEmbeddingIndex();
    await idx.build([entry('a', 'a'), entry('b', 'b')], scriptedClient({ a: [1, 0], b: [1, 0] }));
    const hits = idx.topK([1, 0], 2);
    expect(hits.map((h) => h.id)).toEqual(['a', 'b']);
  });
});
