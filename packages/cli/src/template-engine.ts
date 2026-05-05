// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Sprint 1.1 — template engine for `atelier init`.
 *
 * The standalone-mode scaffold copies a tree of `*.template` files from the
 * CLI's bundled `templates/` directory into the user's target directory,
 * substituting `{{appName}}` / `{{description}}` placeholders along the way.
 * Files NOT ending in `.template` are copied verbatim — that's how we ship
 * literal JSON / Markdown starters (recipes, policies, skills, capabilities)
 * without contaminating them with placeholder syntax.
 *
 * Why hand-rolled (no mustache / handlebars):
 *   - No new runtime dep: the CLI's "no UX libraries" stance applies here.
 *   - The placeholder set is minimal (appName, description, hostKind). A
 *     simple `String.replace` loop is enough.
 *
 * Where templates live on disk:
 *   - In the source tree:   `packages/cli/templates/<host-or-_shared>/`
 *   - In the published tgz: `dist/../templates/` (the package.json `files`
 *     array includes `templates`, so the npm-installed CLI ships them).
 *
 * Resolution strategy (`templatesRoot()`):
 *   - Compute `dirname(fileURLToPath(import.meta.url))` — which is
 *     `packages/cli/src/` in dev (run via `tsx`) and
 *     `packages/cli/dist/` when consumed from npm.
 *   - In both cases `../templates` resolves to the same place because
 *     `templates/` is a sibling to both `src/` and `dist/`.
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Substitution context. Add new keys here and document them in the README. */
export interface TemplateContext {
  /** Target project name. Becomes the `package.json` `name`. */
  appName: string;
  /**
   * Short human-readable project description. Surfaces in the README and
   * the package.json `description` field. Keep it under ~80 chars.
   */
  description: string;
}

/** Resolve the bundled `templates/` root. Works from `src/` or `dist/`. */
export function templatesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/template-engine.ts -> ../templates
  // dist/template-engine.js -> ../templates
  return resolve(here, '..', 'templates');
}

/** Apply `{{appName}}` / `{{description}}` substitution. */
export function applyTemplate(source: string, ctx: TemplateContext): string {
  return source
    .replace(/\{\{appName\}\}/g, ctx.appName)
    .replace(/\{\{description\}\}/g, ctx.description);
}

/**
 * Recursively walk `srcDir` and yield every leaf file's path relative to
 * `srcDir`. Order is deterministic (sorted) so test snapshots stay stable.
 */
export async function listTemplateFiles(srcDir: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }

  await walk(srcDir, '');
  return out;
}

/**
 * Return the destination filename for a template file. Files ending in
 * `.template` lose that suffix; everything else passes through unchanged.
 */
export function destPath(relPath: string): string {
  return relPath.endsWith('.template') ? relPath.slice(0, -'.template'.length) : relPath;
}

/**
 * Read the template, apply substitution if `*.template`, and return the
 * rendered string. Non-`.template` files are returned verbatim.
 */
export async function renderTemplateFile(
  absPath: string,
  ctx: TemplateContext,
  relPath: string,
): Promise<string> {
  const raw = await readFile(absPath, 'utf8');
  if (!relPath.endsWith('.template')) return raw;
  return applyTemplate(raw, ctx);
}

export interface CopyTemplateTreeOptions {
  /** Source directory under `templates/`, e.g. `'next15'` or `'_shared'`. */
  srcDir: string;
  /** Destination root (the user's target project dir). */
  destDir: string;
  /** Substitution context. */
  ctx: TemplateContext;
  /** When true, fails if any destination file already exists. Default false. */
  strict?: boolean;
  /** Optional accumulator for files written. Mutated in-place. */
  filesWritten?: string[];
}

/**
 * Copy a template tree from the bundled `templates/<srcDir>/` into
 * `destDir`, applying placeholder substitution to `*.template` files.
 * Non-template files are copied verbatim. Empty directories are NOT
 * preserved (we don't ship any).
 */
export async function copyTemplateTree(options: CopyTemplateTreeOptions): Promise<string[]> {
  const written = options.filesWritten ?? [];
  const srcRoot = join(templatesRoot(), options.srcDir);
  const files = await listTemplateFiles(srcRoot);
  for (const rel of files) {
    const absSrc = join(srcRoot, rel);
    const relDest = destPath(rel);
    const absDest = join(options.destDir, relDest);
    if (options.strict && existsSync(absDest)) {
      throw new Error(`refusing to overwrite ${relDest} (strict mode)`);
    }
    await mkdir(dirname(absDest), { recursive: true });
    const rendered = await renderTemplateFile(absSrc, options.ctx, rel);
    await writeFile(absDest, rendered, 'utf8');
    written.push(relDest);
  }
  return written;
}

/**
 * Scan a string for unsubstituted `{{key}}` placeholders. Returns the list
 * of unique keys found. Used by `templates.test.ts` to assert every shipped
 * template uses only the documented placeholder set.
 */
export function findPlaceholders(source: string): string[] {
  const matches = source.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  const seen = new Set<string>();
  for (const m of matches) {
    if (m[1]) seen.add(m[1]);
  }
  return [...seen].sort();
}

/** The exhaustive set of keys understood by `applyTemplate`. */
export const KNOWN_PLACEHOLDERS: readonly string[] = Object.freeze(['appName', 'description']);
