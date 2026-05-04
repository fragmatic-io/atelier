// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier inspect <manifest-id-or-path>` — pretty-print a manifest.
 *
 * Two input modes:
 *   - File path: `atelier inspect ./fixtures/manifest.json` — read directly.
 *   - Live id:   `atelier inspect m_a7b3c9d1` — looks up via dev server.
 *                Default `http://localhost:3000/api/cir/manifest/<id>`.
 *                Configurable via `--server <url>`.
 *
 * Output is human-readable, color-cued via raw ANSI escape codes (no chalk
 * dep). Box-drawing characters (`├─`, `└─`) render the layout tree. The
 * `--json` flag dumps the parsed manifest as pretty JSON instead. The
 * `--no-color` flag (or non-TTY stdout) suppresses color escapes.
 *
 * Exit codes: 0 on success, 1 on any failure (file missing, JSON parse error,
 * schema validation error, server unreachable, server returned non-2xx).
 */

/* eslint-disable no-console */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { ManifestSchema, type LayoutNode, type Manifest } from '@atelier/schemas';

import { INSPECT_USAGE } from '../usage.js';

export interface InspectOptions {
  /** The positional argument: either a path or a manifest_id. */
  target: string;
  /** Base URL of the dev server (used when target looks like an id). */
  server?: string;
  /** When true, dumps JSON. When false, the pretty tree. */
  json?: boolean;
  /** When true, suppresses ANSI escapes. Auto-applied when stdout is not a TTY. */
  noColor?: boolean;
  /** cwd used to resolve relative paths. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Injected fetch — defaults to global `fetch`. Tests override. */
  fetchImpl?: typeof fetch;
}

/** True if `target` looks like a manifest id (m_<hex>) — otherwise a path. */
export function looksLikeManifestId(target: string): boolean {
  return /^m_[a-z0-9_-]+$/i.test(target);
}

// ---------------------------------------------------------------------------
// ANSI helpers — kept tiny on purpose. We never touch `globalThis` to detect
// TTYs; the caller passes `noColor` after consulting `process.stdout.isTTY`.
// ---------------------------------------------------------------------------

const ESC = '\x1b[';
const COLORS = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
} as const;

type ColorName = keyof typeof COLORS;

function paint(noColor: boolean, color: ColorName, text: string): string {
  if (noColor) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

/** Strip ANSI escape sequences. Exported for tests. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ---------------------------------------------------------------------------
// Loaders.
// ---------------------------------------------------------------------------

async function loadFromPath(
  path: string,
  cwd: string,
): Promise<{ raw: string; manifest: Manifest }> {
  const abs = isAbsolute(path) ? path : resolve(cwd, path);
  const raw = await readFile(abs, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const manifest = ManifestSchema.parse(parsed);
  return { raw, manifest };
}

async function loadFromServer(
  id: string,
  server: string,
  fetchImpl: typeof fetch,
): Promise<{ raw: string; manifest: Manifest }> {
  // Strip a trailing slash from `server` so the join is well-formed.
  const base = server.replace(/\/+$/, '');
  const url = `${base}/api/cir/manifest/${encodeURIComponent(id)}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`server ${url} returned ${String(res.status)} ${res.statusText}`);
  }
  const raw = await res.text();
  const parsed = JSON.parse(raw) as unknown;
  const manifest = ManifestSchema.parse(parsed);
  return { raw, manifest };
}

// ---------------------------------------------------------------------------
// Pretty-printer.
// ---------------------------------------------------------------------------

/**
 * Render a layout subtree using box-drawing characters. The `prefix` carries
 * the parent's indentation so siblings line up; `isLast` flips the connector
 * between `├─` and `└─`.
 */
function renderLayoutTree(
  node: LayoutNode,
  prefix: string,
  isLast: boolean,
  noColor: boolean,
  out: string[],
): void {
  const connector = isLast ? '└─' : '├─';
  const childPrefix = prefix + (isLast ? '   ' : '│  ');
  const decorations: string[] = [];
  if (node.data?.source) {
    decorations.push(`data: ${node.data.source}`);
  }
  if (node.data?.filter) {
    decorations.push(`filter: ${node.data.filter}`);
  }
  if (node.data?.sort) {
    decorations.push(`sort: ${node.data.sort}`);
  }
  if (node.data?.group_by) {
    decorations.push(`group_by: ${node.data.group_by}`);
  }
  if (node.actions && node.actions.length > 0) {
    decorations.push(`actions: ${node.actions.join(', ')}`);
  }
  const decoStr =
    decorations.length === 0 ? '' : `   ${paint(noColor, 'dim', decorations.join('  '))}`;
  out.push(`${prefix}${connector} ${paint(noColor, 'cyan', node.component)}${decoStr}`);
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    renderLayoutTree(child, childPrefix, i === children.length - 1, noColor, out);
  }
}

/**
 * Render the full manifest as a multi-line string. Pure: takes the manifest
 * and a `noColor` flag, returns the text. Tests assert on the output.
 */
export function renderManifest(manifest: Manifest, noColor: boolean): string {
  const out: string[] = [];
  out.push(
    `${paint(noColor, 'bold', 'manifest')} ${paint(noColor, 'green', manifest.manifest_id)}`,
  );
  out.push(
    `  app: ${paint(noColor, 'magenta', manifest.app_id)}  user: ${paint(noColor, 'magenta', manifest.user_id)}`,
  );

  // compiled_from block.
  out.push(`  ${paint(noColor, 'bold', 'compiled_from:')}`);
  const cf = manifest.compiled_from;
  out.push(`    compiler_model: ${paint(noColor, 'yellow', cf.compiler_model)}`);
  out.push(`    compiled_at:    ${cf.compiled_at}`);
  out.push(`    capability_version:        ${cf.capability_version}`);
  out.push(`    component_catalog_version: ${cf.component_catalog_version}`);
  out.push(`    intent_profile_version:    ${String(cf.intent_profile_version)}`);
  const skillEntries = Object.entries(cf.skill_versions);
  if (skillEntries.length > 0) {
    const skills = skillEntries.map(([id, v]) => `${id}@${v}`).join(', ');
    out.push(`    skills:         ${skills}`);
  }

  // routes.
  out.push(`  ${paint(noColor, 'bold', 'routes')} (${String(manifest.routes.length)}):`);
  for (const route of manifest.routes) {
    const title = route.title ? `  ${paint(noColor, 'dim', `[${route.title}]`)}` : '';
    out.push(`    ${paint(noColor, 'green', route.path)}${title}`);
    if (route.redirect) {
      out.push(`      ${paint(noColor, 'dim', `→ redirect: ${route.redirect}`)}`);
    }
    if (route.layout) {
      const treeLines: string[] = [];
      renderLayoutTree(route.layout, '      ', true, noColor, treeLines);
      out.push(...treeLines);
    }
  }

  // policies.
  if (manifest.policies_satisfied.length > 0) {
    const policyLines: string[] = [];
    const tick = paint(noColor, 'green', '✓');
    for (const p of manifest.policies_satisfied) {
      policyLines.push(`${tick} ${p}`);
    }
    out.push(`  ${paint(noColor, 'bold', 'policies:')} ${policyLines.join('  ')}`);
  }

  // ttl + invalidates_on.
  const ttl = manifest.ttl ?? null;
  out.push(
    `  ttl: ${ttl === null ? paint(noColor, 'dim', 'null') : String(ttl)}   invalidates_on: ${
      manifest.invalidates_on.length === 0
        ? paint(noColor, 'dim', '(none)')
        : manifest.invalidates_on.join(', ')
    }`,
  );

  if (manifest.rollback_to) {
    out.push(`  rollback_to: ${manifest.rollback_to}`);
  }

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Programmatic + CLI entry points.
// ---------------------------------------------------------------------------

export interface InspectResult {
  manifest: Manifest;
  output: string;
}

/**
 * Programmatic entry: load + render. Returns the manifest and rendered string.
 * Throws on failure (caller decides exit code).
 */
export async function runInspect(opts: InspectOptions): Promise<InspectResult> {
  const cwd = opts.cwd ?? process.cwd();
  const noColor = opts.noColor ?? false;
  const target = opts.target;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  let loaded: { raw: string; manifest: Manifest };
  if (looksLikeManifestId(target)) {
    const server = opts.server ?? 'http://localhost:3000';
    loaded = await loadFromServer(target, server, fetchImpl);
  } else {
    loaded = await loadFromPath(target, cwd);
  }

  if (opts.json) {
    return { manifest: loaded.manifest, output: JSON.stringify(loaded.manifest, null, 2) };
  }
  return { manifest: loaded.manifest, output: renderManifest(loaded.manifest, noColor) };
}

/**
 * CLI front-end. Parses positionals/flags, delegates to `runInspect`, prints
 * the rendered output, returns the exit code.
 */
export async function inspectCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(INSPECT_USAGE);
    return 0;
  }
  const target = positionals[0];
  if (!target) {
    console.error(INSPECT_USAGE);
    return 1;
  }
  // Auto-suppress color when stdout is not a TTY.
  const ttyAware =
    flags['no-color'] === 'true' ||
    !(typeof process !== 'undefined' && process.stdout && process.stdout.isTTY);

  try {
    const opts: InspectOptions = {
      target,
      json: flags['json'] === 'true',
      noColor: ttyAware,
      cwd,
    };
    if (flags['server'] !== undefined) opts.server = flags['server'];
    const result = await runInspect(opts);
    console.log(result.output);
    return 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`atelier inspect: ${msg}`);
    return 1;
  }
}
