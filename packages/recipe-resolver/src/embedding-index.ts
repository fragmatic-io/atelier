// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `EmbeddingIndex` + `InMemoryEmbeddingIndex` — internal helper for the
 * Wave C / Phase C-5 `EmbeddingRecipeResolver`. Same shape as the index
 * shipped in `@atelier/capability-resolver`, applied to recipes instead of
 * capabilities.
 *
 * The two packages solve the same problem on different corpora; we
 * deliberately ship a parallel implementation here rather than taking a
 * cross-package dep so the C-5 surface ships without coupling to C-3
 * shipping. When P1.1 lands we can lift the duplicated math into a tiny
 * shared internal helper without touching the public `RecipeResolver`
 * interface.
 *
 * Design constraints (mirrors `@atelier/capability-resolver`):
 *   - No hard dep on a specific embedding provider — `EmbeddingClient`
 *     is the seam.
 *   - Pure-JS cosine similarity. No `numpy` / `faiss` dep.
 *   - Brute-force topK is fast enough for ≤10k recipes; ANN is a
 *     follow-up the seam already supports.
 */

/**
 * Provider-agnostic embedding client. Hosts adapt OpenAI's
 * `text-embedding-3-small` / Cohere `embed-english-v3.0` / Gemini
 * `text-embedding-004` / etc. Tests stub the entire interface.
 */
export interface EmbeddingClient {
  /** Stable id surfaced in audit / logs. */
  readonly id: string;
  /** Embed a single string. */
  embed(text: string): Promise<readonly number[]>;
  /**
   * Optional batch variant. When present the index build calls this
   * once (or in chunks of `batchSize`) instead of N times of `embed`.
   */
  embedBatch?: (texts: readonly string[]) => Promise<readonly (readonly number[])[]>;
}

/**
 * The vector-index contract. `InMemoryEmbeddingIndex` is the shipped
 * implementation; hosts can plug in HNSW / IVF / faiss-bindings behind
 * the same interface without changing the resolver.
 */
export interface EmbeddingIndex {
  /**
   * Build the index from `entries`. Each entry carries an id and the
   * pre-rendered text the model will embed. Replaces any previously
   * built state.
   */
  build(entries: readonly EmbeddingEntry[], client: EmbeddingClient): Promise<void>;
  /**
   * Cosine-similarity top-K query. Returns at most `k` `{id, score}`
   * tuples sorted by score descending.
   */
  topK(query: readonly number[], k: number): readonly { id: string; score: number }[];
  /** Number of entries currently indexed. */
  size(): number;
  /** Embedding dimensionality. `0` when the index is empty. */
  dimension(): number;
}

/** A single index entry: stable id + the text to embed. */
export interface EmbeddingEntry {
  readonly id: string;
  readonly text: string;
}

export interface InMemoryEmbeddingIndexOptions {
  /**
   * When `client.embedBatch` is present, chunk the build into this many
   * texts per call. Default 256.
   */
  batchSize?: number;
}

function l2Norm(v: ArrayLike<number> & { length: number }): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i] as number;
    sum += x * x;
  }
  return Math.sqrt(sum);
}

/**
 * Public for tests + callers that want cosine without the index. Returns
 * `0` on length mismatch / zero-magnitude rather than NaN.
 */
export function cosineSimilarity(
  a: ArrayLike<number> & { length: number },
  b: ArrayLike<number> & { length: number },
): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ax = a[i] as number;
    const bx = b[i] as number;
    dot += ax * bx;
    na += ax * ax;
    nb += bx * bx;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class InMemoryEmbeddingIndex implements EmbeddingIndex {
  readonly #batchSize: number;
  #ids: string[] = [];
  #vectors: Float32Array = new Float32Array(0);
  #norms: Float32Array = new Float32Array(0);
  #dimension = 0;

  constructor(opts: InMemoryEmbeddingIndexOptions = {}) {
    this.#batchSize = Math.max(1, opts.batchSize ?? 256);
  }

  size(): number {
    return this.#ids.length;
  }

  dimension(): number {
    return this.#dimension;
  }

  async build(entries: readonly EmbeddingEntry[], client: EmbeddingClient): Promise<void> {
    // Reset; build is destructive.
    this.#ids = [];
    this.#vectors = new Float32Array(0);
    this.#norms = new Float32Array(0);
    this.#dimension = 0;

    if (entries.length === 0) return;

    const texts = entries.map((e) => e.text);
    const vectors: (readonly number[])[] = [];

    if (client.embedBatch) {
      for (let start = 0; start < texts.length; start += this.#batchSize) {
        const slice = texts.slice(start, start + this.#batchSize);
        const out = await client.embedBatch(slice);
        if (out.length !== slice.length) {
          throw new Error(
            `EmbeddingClient.embedBatch returned ${String(out.length)} vectors for ${String(slice.length)} inputs`,
          );
        }
        for (const v of out) vectors.push(v);
      }
    } else {
      for (const text of texts) {
        vectors.push(await client.embed(text));
      }
    }

    const first = vectors[0];
    if (!first || first.length === 0) {
      throw new Error('EmbeddingClient returned an empty vector');
    }
    const dim = first.length;
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      if (!v || v.length !== dim) {
        throw new Error(
          `EmbeddingClient: dimension mismatch at index ${String(i)} (expected ${String(dim)}, got ${String(v?.length ?? 0)})`,
        );
      }
    }

    const flat = new Float32Array(vectors.length * dim);
    const norms = new Float32Array(vectors.length);
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i] as readonly number[];
      const offset = i * dim;
      for (let j = 0; j < dim; j++) flat[offset + j] = v[j] as number;
      norms[i] = l2Norm(flat.subarray(offset, offset + dim));
    }

    this.#ids = entries.map((e) => e.id);
    this.#vectors = flat;
    this.#norms = norms;
    this.#dimension = dim;
  }

  topK(query: readonly number[], k: number): readonly { id: string; score: number }[] {
    if (k <= 0 || this.#ids.length === 0 || this.#dimension === 0) return [];
    if (query.length !== this.#dimension) return [];

    let qNorm = 0;
    for (let i = 0; i < query.length; i++) {
      const x = query[i] as number;
      qNorm += x * x;
    }
    qNorm = Math.sqrt(qNorm);
    if (qNorm === 0) return [];

    const dim = this.#dimension;
    const n = this.#ids.length;
    const scored: { id: string; score: number; idx: number }[] = [];
    for (let i = 0; i < n; i++) {
      const offset = i * dim;
      let dot = 0;
      for (let j = 0; j < dim; j++) {
        dot += (this.#vectors[offset + j] as number) * (query[j] as number);
      }
      const denom = (this.#norms[i] as number) * qNorm;
      const score = denom === 0 ? 0 : dot / denom;
      scored.push({ id: this.#ids[i] as string, score, idx: i });
    }
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const take = Math.min(k, scored.length);
    const out: { id: string; score: number }[] = [];
    for (let i = 0; i < take; i++) {
      const s = scored[i] as { id: string; score: number };
      out.push({ id: s.id, score: s.score });
    }
    return out;
  }
}
