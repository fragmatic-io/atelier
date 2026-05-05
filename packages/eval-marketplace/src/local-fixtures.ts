// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Local-fixtures source for the marketplace eval gate.
 *
 * Closes the production-readiness gap that the first nightly real-LLM run
 * hit: `MARKETPLACE_VAULT_URL` defaulted to a placeholder, no hosted vault
 * existed yet, the eval reported `0 personas`. This module lets the gate
 * read personas from a local directory of recipe files instead.
 *
 * Each `*.json` (or `*.recipe.json`) file in the directory is parsed as a
 * `Manifest`-shaped recipe. The eval runs the recipe through the configured
 * compile mode (deterministic or real-LLM) per route — same pipeline as
 * the vault-fetch path, just without the wire hop and without signature
 * verification (local files are unsigned).
 *
 * The synthesised marketplace address is `atelier://local/<filename>@1.0.0`
 * so existing `manifest_shape_hash` baselines (which key on the canonical
 * address string) don't fight the local source.
 *
 * See `apps/docs/src/content/docs/operations/cost-dashboard.mdx` for the
 * operator-facing story.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

import type { MarketplaceAddress } from '@atelier/schemas';

import type { ApprovedPersonaList, BundleFetcher } from './types.js';

/** Author segment of every synthesised local-fixture address. */
export const LOCAL_FIXTURES_AUTHOR = 'local';
/** Version pinned on every synthesised local-fixture address. */
export const LOCAL_FIXTURES_VERSION = '1.0.0';

export interface LocalFixturesOptions {
  /** Directory to walk. Resolved relative to the process cwd. */
  directory: string;
}

/**
 * Result of loading the directory once. The runner consumes the
 * `approved` + `fetcher` shims; the `entries` array is exposed for
 * callers that want to log how many recipe files were seen.
 */
export interface LocalFixturesSource {
  approved: ApprovedPersonaList;
  fetcher: BundleFetcher;
  /** One entry per recipe file matched (parsed or unparseable). */
  entries: LocalFixtureEntry[];
}

/**
 * Diagnostic entry for one matched file — exposed so the CLI shim can log
 * a "loaded N recipes (M malformed, skipped)" summary.
 */
export interface LocalFixtureEntry {
  /** Filename without the `.json` / `.recipe.json` extension. */
  name: string;
  /** Absolute path on disk. */
  path: string;
  /**
   * Synthesised canonical address — `atelier://local/<name>@1.0.0`. Set
   * even when `error` is non-null so the runner can record the persona
   * as `skipped` rather than dropping it on the floor.
   */
  address: MarketplaceAddress;
  /** Parsed JSON payload, when the file was readable AND valid JSON. */
  payload?: unknown;
  /** Set when reading or parsing failed. The fetcher returns the error string. */
  error?: string;
}

/**
 * Persona-name regex — lower-snake / dot / hyphen, same as
 * `MarketplaceIdentifierRegex` in `@atelier/schemas`. We re-state it here
 * (rather than importing it) because that schema's regex is
 * package-private. Filenames that don't match get rewritten to a
 * sanitised slug — see `slugify`.
 */
const PERSONA_REGEX = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

/**
 * Strip the `.json` / `.recipe.json` extension from a filename. Returns
 * `null` for non-recipe files (so `glob` callers can filter quickly).
 */
function recipeBasename(filename: string): string | null {
  if (filename.endsWith('.recipe.json')) {
    return filename.slice(0, -'.recipe.json'.length);
  }
  if (extname(filename) === '.json') {
    return basename(filename, '.json');
  }
  return null;
}

/**
 * Best-effort lower-snake slug — used when a filename has uppercase or
 * unsupported characters that would fail `MarketplacePersona`'s regex.
 * The runner doesn't need round-trippability here; this just produces a
 * stable, readable address.
 */
function slugify(name: string): string {
  const lower = name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  // Trim leading non-alphanum to satisfy the persona regex.
  const trimmed = lower.replace(/^[^a-z0-9]+/, '');
  if (trimmed.length === 0) return 'unnamed';
  return trimmed.length > 128 ? trimmed.slice(0, 128) : trimmed;
}

/**
 * List `*.json` / `*.recipe.json` files in `directory`, parse each as a
 * recipe payload, and return an in-memory `ApprovedPersonaList` +
 * `BundleFetcher` pair the runner can consume directly.
 *
 * Files that can't be read or aren't valid JSON still surface as a
 * persona — but with an `error` set on the entry, so the runner records
 * them as `skipped` (visible in the report) rather than silently
 * dropping them. Distinguishes "the file was malformed" from "the file
 * compiled into a broken manifest" — both surfaces are needed.
 */
export function loadLocalFixtures(opts: LocalFixturesOptions): LocalFixturesSource {
  const dir = resolve(opts.directory);
  let names: string[];
  try {
    const stat = statSync(dir);
    if (!stat.isDirectory()) {
      throw new Error(`local-fixtures: ${dir} is not a directory`);
    }
    names = readdirSync(dir);
  } catch (err) {
    throw new Error(
      `local-fixtures: failed to read ${dir} (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const entries: LocalFixtureEntry[] = [];
  // Stable order so the runner's default rank produces the same top-N
  // every run — matches the rest of the gate's determinism contract.
  for (const filename of [...names].sort()) {
    const stem = recipeBasename(filename);
    if (stem === null) continue;
    // Skip files starting with `_` so callers can park templates / WIP
    // recipes in the same directory without polluting the gate.
    if (stem.startsWith('_')) continue;

    const path = resolve(dir, filename);
    const personaName = PERSONA_REGEX.test(stem) ? stem : slugify(stem);
    const address: MarketplaceAddress = {
      scheme: 'atelier',
      author: LOCAL_FIXTURES_AUTHOR,
      persona: personaName,
      version: LOCAL_FIXTURES_VERSION,
    };

    let payload: unknown;
    let error: string | undefined;
    try {
      const text = readFileSync(path, 'utf8');
      try {
        payload = JSON.parse(text);
      } catch (parseErr) {
        error = `malformed JSON: ${(parseErr as Error).message}`;
      }
    } catch (readErr) {
      error = `read failed: ${(readErr as Error).message}`;
    }

    const entry: LocalFixtureEntry = { name: stem, path, address };
    if (payload !== undefined) entry.payload = payload;
    if (error !== undefined) entry.error = error;
    entries.push(entry);
  }

  // Index by persona for O(1) fetch dispatch.
  const byPersona = new Map<string, LocalFixtureEntry>();
  for (const entry of entries) byPersona.set(entry.address.persona, entry);

  const approved: ApprovedPersonaList = {
    list: () => entries.map((e) => e.address),
  };

  const fetcher: BundleFetcher = {
    fetch(address) {
      const entry = byPersona.get(address.persona);
      if (entry === undefined) return Promise.resolve(null);
      if (entry.error !== undefined) {
        return Promise.reject(new Error(entry.error));
      }
      return Promise.resolve(entry.payload);
    },
  };

  return { approved, fetcher, entries };
}
