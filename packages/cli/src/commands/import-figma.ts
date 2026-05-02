// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier import figma <tokens.json>` — turn a W3C Design Tokens JSON export
 * into a Atelier `BrandKit` JSON.
 *
 *   atelier import figma <tokens.json> [--out brand-kit.json]
 *                                  [--id <kit-id>] [--version <semver>]
 *                                  [--dry-run]
 *
 * The W3C draft format (`@design-tokens`) — a recursive `{ $value, $type }`
 * tree — is the same shape the Figma "Export Design Tokens" plugin emits.
 * We walk every leaf and route it into a BrandKit field by its dotted path:
 *
 *     color.primary           -> tokens.colors.primary
 *     spacing.md              -> tokens.spacing.md
 *     radius.sm               -> radius_scale.sm
 *     shadow.lg               -> shadow_scale.lg
 *     duration.fast           -> motion.duration_scale.fast (parsed to ms)
 *     easing.in_out           -> motion.easing.in_out
 *     typography.fontFamily   -> tokens.typography.font_stack
 *     typography.size.lg      -> tokens.typography.scale.lg
 *     typography.weight.bold  -> tokens.typography.weight.bold
 *
 * Tokens with paths we don't recognise are listed as warnings — humans
 * eyeball, retag the input, and re-import. This is a **stub**: perfect
 * mapping isn't required, predictable mapping is.
 *
 * No new dependencies. The W3C tokens format is plain JSON, the BrandKit
 * schema lives in `@atelier/schemas`, and the writer is `fs/promises`.
 */

/* eslint-disable no-console */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import { BrandKitSchema, type BrandKit } from '@atelier/schemas';

// -----------------------------------------------------------------------------
// W3C design tokens — minimal type model.
//
// The format is a tree of objects. A leaf is any object with a `$value` key.
// Branch objects can carry a `$description` / `$type` etc. We treat any other
// non-`$`-prefixed key as a sub-group.
// -----------------------------------------------------------------------------

interface TokenLeaf {
  $value: unknown;
  $type?: string;
  $description?: string;
}

function isLeaf(node: unknown): node is TokenLeaf {
  return typeof node === 'object' && node !== null && '$value' in node;
}

function leafValue(leaf: TokenLeaf): string | number | null {
  const v = leaf.$value;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return v;
  // Composite shadow/typography tokens — collapse to a CSS-like string the
  // human can review. Not perfect; the goal is to surface them.
  if (typeof v === 'object' && v !== null) {
    return JSON.stringify(v);
  }
  return null;
}

interface FlatToken {
  /** Dotted path, e.g. `color.primary`. */
  path: string;
  value: string | number;
  type: string | undefined;
}

function walkTokens(node: unknown, prefix: string[], out: FlatToken[]): void {
  if (typeof node !== 'object' || node === null) return;
  if (isLeaf(node)) {
    const v = leafValue(node);
    if (v !== null) {
      out.push({ path: prefix.join('.'), value: v, type: node.$type });
    }
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    walkTokens(child, [...prefix, key], out);
  }
}

// -----------------------------------------------------------------------------
// Path → BrandKit field router. Order matters: the first matching rule wins.
//
// Each rule accepts the full dotted path (lowercased) and either returns
// `{ section, key }` to place the value, or `null` to defer to the next rule.
// `key` is the leaf key inside the section (last segment, possibly remapped).
// -----------------------------------------------------------------------------

interface MapTarget {
  section:
    | 'colors'
    | 'spacing'
    | 'radius_scale'
    | 'shadow_scale'
    | 'duration_scale'
    | 'easing'
    | 'typography_scale'
    | 'typography_weight'
    | 'typography_font_stack';
  key: string;
}

const COLOR_PREFIXES = ['color', 'colors', 'palette'];
const SPACING_PREFIXES = ['spacing', 'space', 'size'];
const RADIUS_PREFIXES = ['radius', 'radii', 'border-radius', 'borderradius'];
const SHADOW_PREFIXES = ['shadow', 'shadows', 'box-shadow', 'boxshadow'];
const DURATION_PREFIXES = ['duration', 'durations', 'motion.duration'];
const EASING_PREFIXES = ['easing', 'motion.easing'];

function startsWithSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`);
}

function lastSegment(path: string): string {
  const idx = path.lastIndexOf('.');
  return idx === -1 ? path : path.slice(idx + 1);
}

function withoutPrefix(path: string, prefix: string): string {
  if (path === prefix) return '';
  return path.slice(prefix.length + 1);
}

function routeToken(rawPath: string): MapTarget | null {
  const path = rawPath.toLowerCase();

  // Typography routing (most specific first).
  if (
    path === 'typography.fontfamily' ||
    path === 'typography.font_family' ||
    path === 'typography.font-family' ||
    path === 'typography.font_stack' ||
    path === 'typography.fontstack' ||
    path === 'fontfamily' ||
    path === 'font_family' ||
    path === 'font-family'
  ) {
    return { section: 'typography_font_stack', key: 'font_stack' };
  }
  if (startsWithSegment(path, 'typography.size') || startsWithSegment(path, 'fontsize')) {
    const remainder =
      withoutPrefix(path, 'typography.size') ||
      withoutPrefix(path, 'fontsize') ||
      lastSegment(path);
    return { section: 'typography_scale', key: remainder.replace(/\./g, '_') };
  }
  if (
    startsWithSegment(path, 'typography.weight') ||
    startsWithSegment(path, 'fontweight') ||
    startsWithSegment(path, 'font_weight')
  ) {
    const stripped =
      withoutPrefix(path, 'typography.weight') ||
      withoutPrefix(path, 'fontweight') ||
      withoutPrefix(path, 'font_weight') ||
      lastSegment(path);
    return { section: 'typography_weight', key: stripped.replace(/\./g, '_') };
  }
  if (startsWithSegment(path, 'typography.scale')) {
    return { section: 'typography_scale', key: withoutPrefix(path, 'typography.scale') };
  }

  for (const p of COLOR_PREFIXES) {
    if (startsWithSegment(path, p)) {
      return { section: 'colors', key: withoutPrefix(path, p).replace(/\./g, '.') };
    }
  }
  for (const p of SPACING_PREFIXES) {
    if (startsWithSegment(path, p)) {
      return { section: 'spacing', key: withoutPrefix(path, p).replace(/\./g, '_') };
    }
  }
  for (const p of RADIUS_PREFIXES) {
    if (startsWithSegment(path, p)) {
      return { section: 'radius_scale', key: withoutPrefix(path, p).replace(/\./g, '_') };
    }
  }
  for (const p of SHADOW_PREFIXES) {
    if (startsWithSegment(path, p)) {
      return { section: 'shadow_scale', key: withoutPrefix(path, p).replace(/\./g, '_') };
    }
  }
  for (const p of DURATION_PREFIXES) {
    if (startsWithSegment(path, p)) {
      return { section: 'duration_scale', key: withoutPrefix(path, p).replace(/\./g, '_') };
    }
  }
  for (const p of EASING_PREFIXES) {
    if (startsWithSegment(path, p)) {
      return { section: 'easing', key: withoutPrefix(path, p).replace(/\./g, '_') };
    }
  }
  return null;
}

/**
 * Coerce a duration token to integer ms. `200ms` -> 200, `0.2s` -> 200,
 * a number is taken as-is. Returns null if it doesn't parse — caller logs a
 * warning so the human can hand-fix.
 */
export function durationToMs(value: string | number): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const ms = /^(-?\d+(?:\.\d+)?)\s*ms$/i.exec(trimmed);
  if (ms && ms[1] !== undefined) return Math.round(Number(ms[1]));
  const s = /^(-?\d+(?:\.\d+)?)\s*s$/i.exec(trimmed);
  if (s && s[1] !== undefined) return Math.round(Number(s[1]) * 1000);
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return null;
}

// -----------------------------------------------------------------------------
// Build the BrandKit object from flat tokens.
// -----------------------------------------------------------------------------

export interface ConvertOptions {
  id?: string;
  version?: string;
}

export interface ConvertResult {
  brandKit: BrandKit;
  warnings: string[];
  /** Tokens we matched (path, target). Useful for `--dry-run` and tests. */
  mapped: Array<{ path: string; section: string; key: string }>;
  /** Tokens we couldn't route. Surfaced as warnings. */
  unmapped: string[];
}

export function convertTokens(input: unknown, opts: ConvertOptions = {}): ConvertResult {
  const flat: FlatToken[] = [];
  walkTokens(input, [], flat);

  const colors: Record<string, string> = {};
  const spacing: Record<string, string> = {};
  const radius_scale: Record<string, string> = {};
  const shadow_scale: Record<string, string> = {};
  const duration_scale: Record<string, number> = {};
  const easing: Record<string, string> = {};
  const typographyScale: Record<string, string> = {};
  const typographyWeight: Record<string, string> = {};
  let fontStack: string | null = null;

  const warnings: string[] = [];
  const mapped: Array<{ path: string; section: string; key: string }> = [];
  const unmapped: string[] = [];

  for (const tok of flat) {
    const target = routeToken(tok.path);
    if (!target) {
      unmapped.push(tok.path);
      continue;
    }
    const key = target.key.replace(/^_+|_+$/g, '');
    if (key === '' && target.section !== 'typography_font_stack') {
      unmapped.push(tok.path);
      warnings.push(`token "${tok.path}" has no leaf key after prefix removal; skipped.`);
      continue;
    }
    switch (target.section) {
      case 'colors':
        colors[key] = String(tok.value);
        break;
      case 'spacing':
        spacing[key] = String(tok.value);
        break;
      case 'radius_scale':
        radius_scale[key] = String(tok.value);
        break;
      case 'shadow_scale':
        shadow_scale[key] = String(tok.value);
        break;
      case 'duration_scale': {
        const ms = durationToMs(tok.value);
        if (ms === null) {
          warnings.push(`could not parse duration token "${tok.path}"="${String(tok.value)}".`);
          unmapped.push(tok.path);
          continue;
        }
        duration_scale[key] = ms;
        break;
      }
      case 'easing':
        easing[key] = String(tok.value);
        break;
      case 'typography_scale':
        typographyScale[key] = String(tok.value);
        break;
      case 'typography_weight':
        typographyWeight[key] = String(tok.value);
        break;
      case 'typography_font_stack':
        fontStack = String(tok.value);
        break;
    }
    mapped.push({ path: tok.path, section: target.section, key });
  }

  // Sensible defaults — every BrandKit needs colors+spacing+typography to
  // validate. We surface a warning if the input didn't supply them so the
  // human knows the output isn't usable as-is.
  if (Object.keys(colors).length === 0) {
    warnings.push('no color tokens found; tokens.colors will be empty.');
  }
  if (Object.keys(spacing).length === 0) {
    warnings.push('no spacing tokens found; tokens.spacing will be empty.');
  }
  if (fontStack === null) {
    warnings.push(
      'no font family token found; tokens.typography.font_stack defaulted to system-ui.',
    );
  }
  if (Object.keys(typographyScale).length === 0) {
    warnings.push(
      'no typography scale tokens found; tokens.typography.scale defaulted to a single base entry.',
    );
  }

  const brandKit: BrandKit = {
    id: opts.id ?? 'imported.figma',
    version: opts.version ?? '0.1.0',
    tokens: {
      colors,
      spacing,
      typography: {
        font_stack: fontStack ?? 'system-ui, -apple-system, sans-serif',
        scale: Object.keys(typographyScale).length > 0 ? typographyScale : { base: '14px' },
        ...(Object.keys(typographyWeight).length > 0 ? { weight: typographyWeight } : {}),
      },
      ...(Object.keys(radius_scale).length > 0 ? { radius: radius_scale } : {}),
      ...(Object.keys(shadow_scale).length > 0 ? { shadow: shadow_scale } : {}),
    },
    variants: {},
    voice: {
      tone: 'TODO: replace with brand voice (imported from Figma — Figma carries no voice tokens).',
      do: [],
      dont: [],
    },
    ...(Object.keys(radius_scale).length > 0 ? { radius_scale } : {}),
    ...(Object.keys(shadow_scale).length > 0 ? { shadow_scale } : {}),
    ...(Object.keys(duration_scale).length > 0
      ? {
          motion: {
            duration_scale,
            ...(Object.keys(easing).length > 0 ? { easing } : {}),
          },
        }
      : {}),
  };

  return { brandKit, warnings, mapped, unmapped };
}

// -----------------------------------------------------------------------------
// CLI argv parsing — matches `atelier import openapi` style.
// -----------------------------------------------------------------------------

interface ImportArgs {
  spec: string;
  out: string;
  id: string | undefined;
  version: string | undefined;
  dryRun: boolean;
  help: boolean;
}

function parseImportArgs(args: readonly string[]): ImportArgs {
  let spec = '';
  let out = 'brand-kit.json';
  let id: string | undefined;
  let version: string | undefined;
  let dryRun = false;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--help' || a === '-h') {
      help = true;
      continue;
    }
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a === '--out') {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out = next;
        i++;
      }
      continue;
    }
    if (a.startsWith('--out=')) {
      out = a.slice('--out='.length);
      continue;
    }
    if (a === '--id') {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        id = next;
        i++;
      }
      continue;
    }
    if (a.startsWith('--id=')) {
      id = a.slice('--id='.length);
      continue;
    }
    if (a === '--version') {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        version = next;
        i++;
      }
      continue;
    }
    if (a.startsWith('--version=')) {
      version = a.slice('--version='.length);
      continue;
    }
    if (a.startsWith('--')) continue;
    if (spec === '') spec = a;
  }
  return { spec, out, id, version, dryRun, help };
}

const USAGE = `usage: atelier import figma <tokens.json> [--out brand-kit.json]
                                       [--id <kit-id>] [--version <semver>]
                                       [--dry-run]

Convert a W3C Design Tokens (Figma) JSON export to a Atelier BrandKit JSON.
Tokens with unrecognized paths are listed as warnings — review and re-tag
the input or hand-edit the output before publishing.

  --out <file>    Output path (default: brand-kit.json).
  --id <id>       BrandKit id (default: imported.figma).
  --version <v>   BrandKit semver (default: 0.1.0).
  --dry-run       Print the planned output without writing.

The output is a STUB. Voice, variants, iconography, and accessibility
fields are intentionally empty / TODO; Figma's design-tokens format does
not carry that information. Hand-fill before shipping.`;

/**
 * `atelier import figma` programmatic entry point.
 *
 * Args: positional `<tokens.json>`, then any of `--out`, `--id`, `--version`,
 * `--dry-run`. Returns; throws on unrecoverable errors.
 */
export async function importFigma(args: string[]): Promise<void> {
  const parsed = parseImportArgs(args);
  if (parsed.help) {
    console.log(USAGE);
    return;
  }
  if (!parsed.spec) {
    console.error(USAGE);
    throw new Error('missing required argument <tokens.json>');
  }

  const cwd = process.cwd();
  const specPath = isAbsolute(parsed.spec) ? parsed.spec : resolve(cwd, parsed.spec);
  if (!existsSync(specPath)) {
    throw new Error(`tokens file not found: ${specPath}`);
  }
  let raw: string;
  try {
    raw = await readFile(specPath, 'utf8');
  } catch (err) {
    throw new Error(`failed to read ${specPath}: ${(err as Error).message}`);
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    throw new Error(`failed to parse JSON ${specPath}: ${(err as Error).message}`);
  }

  const result = convertTokens(parsedJson, {
    ...(parsed.id !== undefined ? { id: parsed.id } : {}),
    ...(parsed.version !== undefined ? { version: parsed.version } : {}),
  });

  // Validate — the output must round-trip through BrandKitSchema.
  const validation = BrandKitSchema.safeParse(result.brandKit);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`generated BrandKit failed validation: ${issues}`);
  }

  // Per-token warnings.
  for (const w of result.warnings) {
    console.warn(`warn: ${w}`);
  }
  for (const u of result.unmapped) {
    console.warn(`warn: unmapped token "${u}" — review or retag input.`);
  }

  console.log(
    `mapped ${result.mapped.length} token${result.mapped.length === 1 ? '' : 's'}, ` +
      `${result.unmapped.length} unmapped, ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}.`,
  );

  const outPath = isAbsolute(parsed.out) ? parsed.out : resolve(cwd, parsed.out);
  if (parsed.dryRun) {
    console.log(`plan: write ${outPath}`);
    console.log(JSON.stringify(validation.data, null, 2));
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(validation.data, null, 2)}\n`, 'utf8');
  console.log(`wrote ${outPath}`);
  console.error(
    'NOTE: this is a STUB. Hand-fill voice, variants, iconography, and accessibility before publishing.',
  );
}
