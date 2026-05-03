// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `pnpm capabilities:index` — emit `_index.json` summary files for every
 * directory under `capabilities/` (and the root). Wave 10 / S-5.
 *
 * Each `_index.json` summarises its directory's contents:
 *
 *     {
 *       "version": "0.2.0",
 *       "generated_at": "2026-05-03T12:00:00.000Z",
 *       "capabilities": [
 *         { "id": "github.issue.create", "version": "0.1.0", "path": "issue.create.json" },
 *         …
 *       ],
 *       "subdirectories": ["issue", "repo", …]
 *     }
 *
 * The root `_index.json` aggregates EVERY capability file in the tree (paths
 * relative to `capabilities/`). Per-directory `_index.json` files only list
 * the capabilities directly inside that directory; `subdirectories` names the
 * immediate children that themselves have an index.
 *
 * Why this matters (Wave 10 / S-5):
 *  - Hierarchical paths: capabilities can live under arbitrary subtrees
 *    (e.g. `capabilities/github/issue/list.json`) without breaking the
 *    `id`-keyed dispatch — the path is purely organisational; the `id` field
 *    inside each file remains canonical (e.g. `github.issue.list`).
 *  - Generated index: lets downstream tooling (compiler scoping in S-1, the
 *    marketplace registry in V-6, the LLM "discover capabilities" surface)
 *    enumerate available capabilities without walking the filesystem.
 *  - Stable, prettier-formatted output: the generator is wired to a `--check`
 *    gate so CI catches stale indices the same way `pnpm components:check`
 *    catches stale `components/registry.json`.
 *
 * The `generated_at` timestamp is normalised to a fixed sentinel
 * (`__GENERATED_AT__`) before disk-comparison so the `--check` gate doesn't
 * flap minute-to-minute. The on-disk file carries a real ISO timestamp; the
 * comparison strips it from BOTH sides before diffing.
 *
 * Usage:
 *   tsx scripts/generate-capability-index.ts          # write all _index.json
 *   tsx scripts/generate-capability-index.ts --check  # diff vs disk; exit 1 on drift
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fg from 'fast-glob';
import * as prettier from 'prettier';

import {
  CAPABILITY_INDEX_GENERATED_AT_SENTINEL,
  CapabilityIndexSchema,
  CapabilitySchema,
  type CapabilityIndex,
  type CapabilityIndexEntry,
} from '@atelier/schemas';

const ROOT = resolve(import.meta.dirname, '..');
const CAPS_DIR = resolve(ROOT, 'capabilities');

/**
 * Index format version. Bump if the on-disk shape changes — the matching
 * `CapabilityIndexSchema` lives in `@atelier/schemas` so consumers don't
 * have to depend on this script.
 */
export const INDEX_VERSION = '0.2.0';

/**
 * Re-export the schema sentinel under a script-local name so existing
 * test imports keep resolving. Same value as
 * `CAPABILITY_INDEX_GENERATED_AT_SENTINEL` in `@atelier/schemas`.
 */
export const GENERATED_AT_SENTINEL = CAPABILITY_INDEX_GENERATED_AT_SENTINEL;

// Re-export the schema + types so callers in this directory don't have to
// reach into `@atelier/schemas` themselves.
export { CapabilityIndexSchema, type CapabilityIndex, type CapabilityIndexEntry };

interface CapabilityFile {
  /** Absolute path on disk. */
  absPath: string;
  /** Path relative to `capabilities/`. Always forward-slash separated. */
  relPath: string;
  /** Parsed capability id. */
  id: string;
  /** Parsed capability version. */
  version: string;
}

/**
 * Walk `capabilitiesRoot` (default `capabilities/`) and parse every
 * `*.json` file (skipping the generated `_index.json` summaries). Validates
 * each file against `CapabilitySchema`; throws on the first failure with a
 * human-readable message naming the offending path.
 *
 * Exported for tests + the incremental validator.
 */
export async function readAllCapabilityFiles(
  capabilitiesRoot: string = CAPS_DIR,
): Promise<readonly CapabilityFile[]> {
  if (!existsSync(capabilitiesRoot)) return [];
  const files = await fg('**/*.json', {
    cwd: capabilitiesRoot,
    absolute: true,
    ignore: ['**/_index.json'],
  });
  files.sort();
  const out: CapabilityFile[] = [];
  for (const absPath of files) {
    const relPath = toForwardSlash(relative(capabilitiesRoot, absPath));
    const raw = await readFile(absPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`capabilities/${relPath}: invalid JSON — ${(err as Error).message}`);
    }
    const result = CapabilitySchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '/'}: ${i.message}`)
        .join('; ');
      throw new Error(`capabilities/${relPath}: invalid capability — ${issues}`);
    }
    out.push({
      absPath,
      relPath,
      id: result.data.id,
      version: result.data.version,
    });
  }
  return out;
}

/**
 * Build the ROOT `_index.json` that aggregates every capability in the tree.
 * Paths are relative to `capabilities/` (e.g. `github/issue.create.json`).
 */
export function buildRootIndex(
  files: readonly CapabilityFile[],
  generatedAt: string,
): CapabilityIndex {
  const capabilities = files
    .map(
      (f): CapabilityIndexEntry => ({
        id: f.id,
        version: f.version,
        path: f.relPath,
      }),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  // Immediate-child subdirectory names: anything containing a `/` in its
  // relative path contributes its first segment.
  const subdirSet = new Set<string>();
  for (const f of files) {
    const slash = f.relPath.indexOf('/');
    if (slash !== -1) {
      subdirSet.add(f.relPath.slice(0, slash));
    }
  }
  const subdirectories = [...subdirSet].sort();

  return { version: INDEX_VERSION, generated_at: generatedAt, capabilities, subdirectories };
}

/**
 * Build the index for a specific subdirectory. `dirRel` is the directory
 * path relative to `capabilities/` (e.g. `'github'` or `'github/issue'`).
 *
 * Capabilities in the result list paths RELATIVE TO `dirRel` so each entry
 * is local (e.g. `'issue.create.json'` rather than `'github/issue.create.json'`).
 */
export function buildSubdirectoryIndex(
  dirRel: string,
  files: readonly CapabilityFile[],
  generatedAt: string,
): CapabilityIndex {
  const prefix = `${dirRel}/`;
  const inDir = files.filter((f) => f.relPath.startsWith(prefix));
  const capabilities: CapabilityIndexEntry[] = [];
  const subdirSet = new Set<string>();
  for (const f of inDir) {
    const local = f.relPath.slice(prefix.length);
    const slash = local.indexOf('/');
    if (slash === -1) {
      // Direct child of `dirRel`.
      capabilities.push({ id: f.id, version: f.version, path: local });
    } else {
      // Nested deeper — contributes a subdirectory name.
      subdirSet.add(local.slice(0, slash));
    }
  }
  capabilities.sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: INDEX_VERSION,
    generated_at: generatedAt,
    capabilities,
    subdirectories: [...subdirSet].sort(),
  };
}

/**
 * Compute the set of directories that should carry an `_index.json`. This
 * is every directory that contains at least one capability (directly or
 * nested) — including the root `capabilities/` itself (returned as `''`).
 */
export function indexedDirectories(files: readonly CapabilityFile[]): readonly string[] {
  const dirs = new Set<string>(['']); // root always indexed
  for (const f of files) {
    const segments = f.relPath.split('/');
    // For each prefix dir, register it.
    for (let i = 1; i < segments.length; i++) {
      dirs.add(segments.slice(0, i).join('/'));
    }
  }
  return [...dirs].sort();
}

/**
 * Build every `_index.json` payload as a `Map<absolutePath, CapabilityIndex>`.
 * The root index lives at `capabilities/_index.json`; subdirectory indices
 * live at `capabilities/<dir>/_index.json`.
 */
export function buildAllIndices(
  files: readonly CapabilityFile[],
  generatedAt: string,
  capabilitiesRoot: string = CAPS_DIR,
): Map<string, CapabilityIndex> {
  const out = new Map<string, CapabilityIndex>();
  for (const dir of indexedDirectories(files)) {
    const index =
      dir === ''
        ? buildRootIndex(files, generatedAt)
        : buildSubdirectoryIndex(dir, files, generatedAt);
    const target = join(capabilitiesRoot, dir, '_index.json');
    out.set(target, index);
  }
  return out;
}

/**
 * Stable, prettier-formatted serialization with sorted object keys. Mirrors
 * the same helper in `scripts/sync-component-registry.ts` so output is
 * format-stable across both generators.
 */
async function stableStringify(value: unknown, anchorPath: string): Promise<string> {
  const sorted = JSON.stringify(value, sortReplacer, 2);
  const config = await prettier.resolveConfig(anchorPath);
  return prettier.format(sorted, { ...config, parser: 'json' });
}

function sortReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}

/** Replace whatever ISO timestamp lives in a serialized index with the sentinel. */
function withSentinelTimestamp(serialized: string): string {
  return serialized.replace(
    /"generated_at": "[^"]+"/u,
    `"generated_at": "${GENERATED_AT_SENTINEL}"`,
  );
}

function toForwardSlash(p: string): string {
  return p.split('\\').join('/');
}

interface CheckResult {
  ok: boolean;
  /** Files that drifted (relative to repo root). */
  drifted: string[];
  /** Files missing on disk (relative to repo root). */
  missing: string[];
}

async function checkOnDisk(
  indices: Map<string, CapabilityIndex>,
  capabilitiesRoot: string,
): Promise<CheckResult> {
  const drifted: string[] = [];
  const missing: string[] = [];
  for (const [absPath, index] of indices) {
    const rel = relative(ROOT, absPath);
    if (!existsSync(absPath)) {
      missing.push(rel);
      continue;
    }
    const serialized = await stableStringify(index, absPath);
    const onDisk = await readFile(absPath, 'utf8');
    if (withSentinelTimestamp(serialized) !== withSentinelTimestamp(onDisk)) {
      drifted.push(rel);
    }
  }
  // Also flag stale `_index.json` files that no longer correspond to any
  // capability subtree (e.g. someone deleted the last capability under a
  // directory but left the `_index.json` behind).
  const stale = await fg('**/_index.json', { cwd: capabilitiesRoot, absolute: true });
  const expected = new Set(indices.keys());
  for (const abs of stale) {
    if (!expected.has(abs)) {
      drifted.push(relative(ROOT, abs));
    }
  }
  return { ok: drifted.length === 0 && missing.length === 0, drifted, missing };
}

async function writeAll(indices: Map<string, CapabilityIndex>): Promise<void> {
  for (const [absPath, index] of indices) {
    const serialized = await stableStringify(index, absPath);
    await writeFile(absPath, serialized, 'utf8');
  }
}

export async function generate(
  options: { check?: boolean; capabilitiesRoot?: string; now?: string } = {},
): Promise<{ wrote: number; checked: number; drift: CheckResult | null }> {
  const capabilitiesRoot = options.capabilitiesRoot ?? CAPS_DIR;
  const generatedAt = options.now ?? new Date().toISOString();
  const files = await readAllCapabilityFiles(capabilitiesRoot);
  const indices = buildAllIndices(files, generatedAt, capabilitiesRoot);
  // Validate every index payload against its schema before touching disk —
  // refuses to emit a bad index if the builders ever produce one.
  for (const index of indices.values()) {
    CapabilityIndexSchema.parse(index);
  }
  if (options.check === true) {
    const result = await checkOnDisk(indices, capabilitiesRoot);
    return { wrote: 0, checked: indices.size, drift: result };
  }
  await writeAll(indices);
  return { wrote: indices.size, checked: 0, drift: null };
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const result = await generate({ check });
  if (check) {
    const drift = result.drift;
    if (!drift?.ok) {
      console.error(
        'capabilities:index --check: drift detected. Run `pnpm capabilities:index` to regenerate.',
      );
      for (const m of drift?.missing ?? []) {
        console.error(`  missing: ${m}`);
      }
      for (const d of drift?.drifted ?? []) {
        console.error(`  drift:   ${d}`);
      }
      process.exit(1);
    }
    console.warn(`capabilities:index --check: ok (${result.checked} index file(s))`);
    return;
  }
  console.warn(`capabilities:index: wrote ${result.wrote} _index.json file(s)`);
}

const invokedAsScript = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((err: unknown) => {
    console.error('capabilities:index: unexpected error');
    console.error(err);
    process.exit(1);
  });
}

// Re-export root paths for tests and the incremental validator. The
// `GENERATED_AT_SENTINEL` re-export is already declared above.
export { CAPS_DIR, ROOT };
