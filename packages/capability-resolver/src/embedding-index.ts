// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `EmbeddingIndex` + `InMemoryEmbeddingIndex` — Wave 10 / S-7 (RAG variant
 * of S-1).
 *
 * Vector-embedding index for capability scoping. The two-stage resolver
 * (S-1) uses a tiny LLM call to pick the top-K capabilities; this S-7
 * variant uses precomputed dense vectors and cosine similarity instead.
 * Past ~1000 capabilities the LLM-pick approach starts to brown out (the
 * tiny model can't reliably reason over long flat lists), and embeddings
 * become both cheaper and more accurate.
 *
 * ## Design constraints
 *
 *   - **No hard dep on a specific embedding provider.** The package
 *     defines an `EmbeddingClient` seam — hosts plug in OpenAI / Cohere /
 *     Gemini / a local model / etc. Same shape as the `ScopingLlmClient`
 *     seam in `two-stage-resolver.ts` so the two stories rhyme.
 *   - **Pure-JS cosine similarity.** No `numpy` / `faiss` dep. For ≤10k
 *     vectors of 1.5k dimensions we ship plain `Float32Array` math; the
 *     hot loop in `topK` runs at ~50µs/query on commodity v8. Hosts past
 *     that scale should swap in an HNSW / IVF index but the seam is the
 *     same.
 *   - **Persistence.** `serialize()` / `load()` round-trip the index so
 *     we don't re-embed on every boot. The format is JSON for debugging
 *     friendliness; the vectors are base64-encoded `Float32Array`s to
 *     avoid the 4x bloat of one-float-per-JSON-number.
 *   - **Cold start fallback.** The resolver (`embedding-resolver.ts`)
 *     accepts an optional `fallback: CapabilityResolver` it cascades to
 *     when the index is empty or the embedding client errors. Same
 *     cascade pattern as `TwoStageCapabilityResolver`.
 *
 * ## What we don't do
 *
 *   - Re-rank. The index returns raw cosine scores; the resolver does no
 *     post-processing. Hosts that want hybrid lexical+vector ranking can
 *     wrap the resolver and merge with the substring resolver themselves.
 *   - Approximate-NN. Brute force is fast enough to ship; the HNSW story
 *     is a follow-up the seam already supports (the `EmbeddingIndex`
 *     interface doesn't mandate brute force).
 *   - Retraining / fine-tuning. Embeddings come from the host's chosen
 *     model. We're a consumer of vectors, not a trainer.
 */

import type { Capability } from '@atelier/schemas';

/**
 * Provider-agnostic embedding client. Hosts adapt OpenAI's
 * `text-embedding-3-small` / Cohere `embed-english-v3.0` / Gemini
 * `text-embedding-004` / etc. to this shape. Tests stub the entire
 * interface.
 *
 * The contract:
 *
 *   - `embed(text)` — embed a single string. Used at query time and as
 *     the per-capability fallback when `embedBatch` is not implemented.
 *   - `embedBatch(texts)` — optional. When the provider supports batch
 *     embedding (almost all do), index build is materially faster (the
 *     OpenAI batch endpoint accepts up to 2048 inputs per call).
 *
 * The dimension MUST be stable across all calls from a single client —
 * the index pre-allocates `Float32Array`s of that size and asserts on
 * mismatch. Switching embedding models is therefore a "rebuild the
 * index" operation, not a hot swap.
 */
export interface EmbeddingClient {
  /** Stable id surfaced in audit / logs. e.g. `'openai/text-embedding-3-small'`. */
  readonly id: string;
  /** Embed a single string. */
  embed(text: string): Promise<readonly number[]>;
  /**
   * Optional batch variant. When present the index build calls this
   * once (or in chunks of `batchSize`) instead of N times of `embed`.
   * Implementations MUST return vectors in the same order as `texts`.
   */
  embedBatch?: (texts: readonly string[]) => Promise<readonly (readonly number[])[]>;
}

/**
 * The vector-index contract. `InMemoryEmbeddingIndex` is the shipped
 * implementation; hosts can plug in HNSW / IVF / faiss-bindings behind
 * the same interface without changing the resolver.
 *
 * Note that `topK` is sync — by the time the resolver calls it, the
 * query vector has already been computed (an async step). Sync `topK`
 * keeps the hot loop in plain v8 without scheduler hops.
 */
export interface EmbeddingIndex {
  /**
   * Build the index from `capabilities`. Embeds each capability's
   * "id + description" string via `client`, stores the vectors, and
   * pre-computes their L2 norms for cheap cosine similarity. Replaces
   * any previously built state.
   */
  build(capabilities: readonly Capability[], client: EmbeddingClient): Promise<void>;
  /**
   * Cosine-similarity top-K query. Returns at most `k` `{id, score}`
   * tuples sorted by score descending. Score is in `[-1, 1]` — `1` is
   * a perfect match, `0` orthogonal, `-1` opposite. Ties are broken by
   * the order the capability was indexed (stable).
   */
  topK(query: readonly number[], k: number): readonly { id: string; score: number }[];
  /** Persist the index to a string. JSON shape is internal. */
  serialize(): string;
  /** Load a previously serialized index in-place. */
  load(serialized: string): void;
  /** Number of capabilities currently indexed. Test seam + diagnostics. */
  size(): number;
  /** Embedding dimensionality. `0` when the index is empty. */
  dimension(): number;
}

/** Options for `InMemoryEmbeddingIndex`. All optional. */
export interface InMemoryEmbeddingIndexOptions {
  /**
   * When `client.embedBatch` is present, chunk the build into this many
   * texts per call. Default 256 — well under OpenAI's 2048 limit and
   * small enough that one failure doesn't sink the whole rebuild.
   */
  batchSize?: number;
}

/**
 * Pack a capability id + description into the string the embedding
 * model sees. We concatenate so a single embedding represents both
 * "what is this called" and "what does it do". Hosts that want a more
 * elaborate template can pre-process their `Capability[]` before
 * calling `build`.
 */
function capabilityText(cap: Capability): string {
  const desc = (cap as { description?: string }).description ?? '';
  return desc.length > 0 ? `${cap.id}: ${desc}` : cap.id;
}

/**
 * Compute the L2 norm (Euclidean magnitude) of a vector. Used once per
 * vector at build time so cosine similarity reduces to a plain dot
 * product divided by precomputed magnitudes.
 */
function l2Norm(v: ArrayLike<number> & { length: number }): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i] as number;
    sum += x * x;
  }
  return Math.sqrt(sum);
}

/**
 * Public for tests + future re-rankers. Cosine similarity in `[-1, 1]`
 * (or `0` when either vector is zero-magnitude — the safer convention
 * here than NaN). Both vectors must have the same length; the function
 * returns `0` on length mismatch rather than throwing so a stale query
 * vector against a fresh index degrades gracefully.
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

/**
 * Compact base64 encoding for `Float32Array`. Saves ~4x over
 * one-float-per-JSON-number while keeping the serialized shape JSON
 * for debugability of the surrounding metadata.
 */
function f32ToBase64(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  // Node-friendly path; the package targets Node ≥22 per the workspace.
  return Buffer.from(bytes).toString('base64');
}

function f32FromBase64(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  // Copy into a fresh ArrayBuffer to detach from Node's pooled Buffer
  // memory — the consumer shouldn't share storage with whatever the
  // pool reuses next.
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return new Float32Array(bytes.buffer);
}

/**
 * Serialized format. Versioned so we can evolve later without breaking
 * existing on-disk indexes. The `clientId` is informational (audit /
 * "is this index from the same model my client uses").
 */
interface SerializedIndex {
  v: 1;
  clientId: string;
  dimension: number;
  ids: readonly string[];
  /** Base64-encoded Float32Array of length `ids.length * dimension`. */
  vectors: string;
}

/**
 * In-memory brute-force cosine-similarity index. Adequate for ≤10k
 * capabilities (well past the S-1 cross-over point). Hosts past that
 * scale plug in an ANN index implementing the same `EmbeddingIndex`
 * interface.
 */
export class InMemoryEmbeddingIndex implements EmbeddingIndex {
  readonly #batchSize: number;
  /** Capability ids in insertion order. Indexes line up with `#vectors`. */
  #ids: string[] = [];
  /** Flat `Float32Array` of length `#ids.length * #dimension`. */
  #vectors: Float32Array = new Float32Array(0);
  /** Precomputed L2 norms parallel to `#ids`. */
  #norms: Float32Array = new Float32Array(0);
  #dimension = 0;
  /** Last `client.id` used to build. Surfaces in `serialize()`. */
  #clientId = '';

  constructor(opts: InMemoryEmbeddingIndexOptions = {}) {
    this.#batchSize = Math.max(1, opts.batchSize ?? 256);
  }

  size(): number {
    return this.#ids.length;
  }

  dimension(): number {
    return this.#dimension;
  }

  async build(capabilities: readonly Capability[], client: EmbeddingClient): Promise<void> {
    // Reset; build is destructive. Surfacing partial state on failure
    // would be worse than a clean empty index — the caller can retry.
    this.#ids = [];
    this.#vectors = new Float32Array(0);
    this.#norms = new Float32Array(0);
    this.#dimension = 0;
    this.#clientId = client.id;

    if (capabilities.length === 0) return;

    const texts = capabilities.map((c) => capabilityText(c));
    const vectors: (readonly number[])[] = [];

    if (client.embedBatch) {
      // Chunked batch path — typical OpenAI-style providers cap at
      // 2048 inputs per call; we stay well under at 256/default.
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
      // Per-call fallback. Slow on cold boot but correct.
      for (const text of texts) {
        vectors.push(await client.embed(text));
      }
    }

    // Determine dimension from the first vector and validate the rest.
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

    // Pack into a single contiguous Float32Array for cache-friendly
    // dot-product loops in `topK`.
    const flat = new Float32Array(vectors.length * dim);
    const norms = new Float32Array(vectors.length);
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i] as readonly number[];
      const offset = i * dim;
      for (let j = 0; j < dim; j++) flat[offset + j] = v[j] as number;
      norms[i] = l2Norm(flat.subarray(offset, offset + dim));
    }

    this.#ids = capabilities.map((c) => c.id);
    this.#vectors = flat;
    this.#norms = norms;
    this.#dimension = dim;
  }

  topK(query: readonly number[], k: number): readonly { id: string; score: number }[] {
    if (k <= 0 || this.#ids.length === 0 || this.#dimension === 0) return [];
    if (query.length !== this.#dimension) return [];

    // Precompute query norm; bail on zero-magnitude (would yield NaN).
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
    // Sort by score desc, ties broken by insertion order (stable).
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const take = Math.min(k, scored.length);
    const out: { id: string; score: number }[] = [];
    for (let i = 0; i < take; i++) {
      const s = scored[i] as { id: string; score: number };
      out.push({ id: s.id, score: s.score });
    }
    return out;
  }

  serialize(): string {
    const payload: SerializedIndex = {
      v: 1,
      clientId: this.#clientId,
      dimension: this.#dimension,
      ids: this.#ids,
      vectors: f32ToBase64(this.#vectors),
    };
    return JSON.stringify(payload);
  }

  load(serialized: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch (err) {
      throw new Error(
        `InMemoryEmbeddingIndex.load: invalid JSON (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('InMemoryEmbeddingIndex.load: expected an object');
    }
    const obj = parsed as Partial<SerializedIndex>;
    if (obj.v !== 1) {
      throw new Error(`InMemoryEmbeddingIndex.load: unsupported version ${String(obj.v)}`);
    }
    if (typeof obj.dimension !== 'number' || obj.dimension < 0) {
      throw new Error('InMemoryEmbeddingIndex.load: missing/invalid dimension');
    }
    if (!Array.isArray(obj.ids)) {
      throw new Error('InMemoryEmbeddingIndex.load: missing ids');
    }
    if (typeof obj.vectors !== 'string') {
      throw new Error('InMemoryEmbeddingIndex.load: missing vectors');
    }
    const ids: string[] = [];
    for (const id of obj.ids) {
      if (typeof id !== 'string') {
        throw new Error('InMemoryEmbeddingIndex.load: ids must be strings');
      }
      ids.push(id);
    }
    const flat = f32FromBase64(obj.vectors);
    const expectedLen = ids.length * obj.dimension;
    if (flat.length !== expectedLen) {
      throw new Error(
        `InMemoryEmbeddingIndex.load: vectors length ${String(flat.length)} != ids*dim ${String(expectedLen)}`,
      );
    }
    const norms = new Float32Array(ids.length);
    for (let i = 0; i < ids.length; i++) {
      const offset = i * obj.dimension;
      norms[i] = l2Norm(flat.subarray(offset, offset + obj.dimension));
    }
    this.#ids = ids;
    this.#vectors = flat;
    this.#norms = norms;
    this.#dimension = obj.dimension;
    this.#clientId = typeof obj.clientId === 'string' ? obj.clientId : '';
  }
}
