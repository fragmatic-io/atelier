// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `LocalRecipeStore` — file-system-backed `RecipeStore` over an in-tree
 * `recipes/` directory. Default for `apps/demo` and the test fixtures.
 *
 * Each `*.json` in the directory is loaded as one recipe. Recipes ship as
 * either:
 *
 *   1. A flat manifest blob — what the existing `recipes/` directory
 *      ships today (a `Manifest`-shaped JSON with `manifest_id`,
 *      `routes`, etc.). The store derives the recipe id from the
 *      filename; the description is read from a sibling `.meta.json`
 *      file when present, else falls back to a sensible default.
 *   2. A wrapped recipe object: `{ id, description, domain, brand_kit_id,
 *      intent_surfaces, manifest }`. Used by hosts that want full
 *      control over the recipe metadata without writing a `.meta.json`.
 *
 * The store is intentionally simple — it's the dev / fixture story. V-6
 * will swap in a marketplace-backed `RecipeStore` and the resolver
 * doesn't notice.
 *
 * ## Why no glob / chokidar
 *
 * The store reads the directory once on construct (or per `list()` when
 * `eager: false`). Hot-reloading a recipe set in production is not in
 * scope; hosts that want it can subscribe to filesystem events
 * themselves and call `load()` again.
 */

import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type { Recipe, RecipeStore } from './types.js';

export interface LocalRecipeStoreOptions {
  /**
   * Absolute path to the recipes directory. Required — we explicitly
   * don't infer `cwd` because tests pass a fixture dir.
   */
  directory: string;
  /**
   * Eagerly load on construct. Defaults to `false` — `list()` lazily
   * loads on first call. Set to `true` if a host wants `list()` to be
   * synchronous-from-the-resolver's-perspective (it still returns a
   * Promise, but the promise resolves immediately).
   */
  eager?: boolean;
  /**
   * Optional override for default description when a manifest-shaped
   * recipe ships without a `.meta.json` sidecar. Defaults to the recipe
   * id.
   */
  defaultDescription?: (id: string) => string;
}

/**
 * Sidecar metadata for manifest-shaped recipes. Optional. Stored
 * alongside the recipe at `<id>.meta.json`.
 */
interface RecipeMeta {
  description?: string;
  domain?: string;
  brand_kit_id?: string;
  intent_surfaces?: readonly string[];
}

interface WrappedRecipe extends RecipeMeta {
  id: string;
  manifest?: unknown;
}

export class LocalRecipeStore implements RecipeStore {
  readonly #directory: string;
  readonly #defaultDescription: (id: string) => string;
  #recipes: Map<string, Recipe> | null = null;
  #loadPromise: Promise<Map<string, Recipe>> | null = null;

  constructor(opts: LocalRecipeStoreOptions) {
    this.#directory = opts.directory;
    this.#defaultDescription = opts.defaultDescription ?? ((id) => id);
    if (opts.eager === true) {
      // Fire-and-forget; `list()` still awaits the same promise.
      void this.#ensureLoaded();
    }
  }

  async list(): Promise<readonly Recipe[]> {
    const map = await this.#ensureLoaded();
    return Array.from(map.values());
  }

  async get(id: string): Promise<Recipe | null> {
    const map = await this.#ensureLoaded();
    return map.get(id) ?? null;
  }

  /**
   * Force a re-read of the directory. Useful for tests that mutate the
   * fixture set or for hosts that want explicit reload control.
   */
  async reload(): Promise<void> {
    this.#recipes = null;
    this.#loadPromise = null;
    await this.#ensureLoaded();
  }

  async #ensureLoaded(): Promise<Map<string, Recipe>> {
    if (this.#recipes) return this.#recipes;
    if (!this.#loadPromise) {
      this.#loadPromise = this.#load();
    }
    this.#recipes = await this.#loadPromise;
    return this.#recipes;
  }

  async #load(): Promise<Map<string, Recipe>> {
    const out = new Map<string, Recipe>();

    let entries: readonly Dirent[];
    try {
      const s = await stat(this.#directory);
      if (!s.isDirectory()) {
        throw new Error(`LocalRecipeStore: ${this.#directory} is not a directory`);
      }
      entries = await readdir(this.#directory, { withFileTypes: true });
    } catch (err) {
      throw new Error(
        `LocalRecipeStore: failed to read ${this.#directory} (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    // Pre-index sidecar `.meta.json` files so manifest-shaped recipes
    // can pick up their metadata.
    const sidecars = new Map<string, RecipeMeta>();
    const recipeFiles: string[] = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const name = ent.name;
      if (name.endsWith('.meta.json')) {
        const id = name.slice(0, -'.meta.json'.length);
        const meta = await this.#readJson(join(this.#directory, name));
        if (meta && typeof meta === 'object') {
          sidecars.set(id, meta);
        }
        continue;
      }
      if (extname(name) === '.json') {
        recipeFiles.push(name);
      }
    }

    for (const file of recipeFiles) {
      const id = basename(file, '.json');
      const path = join(this.#directory, file);
      const data = await this.#readJson(path);
      if (!data || typeof data !== 'object') continue;
      out.set(id, this.#materialise(id, data, sidecars.get(id)));
    }
    return out;
  }

  async #readJson(path: string): Promise<unknown> {
    try {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `LocalRecipeStore: failed to parse ${path} (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  #materialise(id: string, data: unknown, sidecar: RecipeMeta | undefined): Recipe {
    const obj = data as Record<string, unknown>;
    // Wrapped recipe shape: explicit `id` AND explicit `description`.
    // Fall through to the manifest-shape path otherwise so a manifest
    // that happens to carry a stray `description` field still resolves
    // correctly.
    if (
      typeof obj['id'] === 'string' &&
      typeof obj['description'] === 'string' &&
      obj['routes'] === undefined
    ) {
      const w = obj as unknown as WrappedRecipe;
      return materialiseWrapped(w);
    }

    // Manifest shape — use sidecar (or defaults) for the metadata
    // surface.
    const meta = sidecar ?? {};
    const recipe: Recipe = {
      id,
      description: meta.description ?? this.#defaultDescription(id),
      ...(meta.domain !== undefined ? { domain: meta.domain } : {}),
      ...(meta.brand_kit_id !== undefined ? { brand_kit_id: meta.brand_kit_id } : {}),
      ...(meta.intent_surfaces !== undefined ? { intent_surfaces: meta.intent_surfaces } : {}),
      manifest: data,
    };
    return recipe;
  }
}

function materialiseWrapped(w: WrappedRecipe): Recipe {
  return {
    id: w.id,
    description: w.description ?? w.id,
    ...(w.domain !== undefined ? { domain: w.domain } : {}),
    ...(w.brand_kit_id !== undefined ? { brand_kit_id: w.brand_kit_id } : {}),
    ...(w.intent_surfaces !== undefined ? { intent_surfaces: w.intent_surfaces } : {}),
    ...(w.manifest !== undefined ? { manifest: w.manifest } : {}),
  };
}
