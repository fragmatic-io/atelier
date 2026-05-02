// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `cir import figma`.
 *
 * The fixture is a small W3C Design Tokens JSON tree with one token per
 * BrandKit field plus a couple of unmapped ones to exercise the warning
 * path. Each test round-trips: write fixture -> run importer -> read output
 * -> assert via `BrandKitSchema`.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BrandKitSchema } from '@atelier/schemas';
import { convertTokens, durationToMs, importFigma } from '../src/commands/import-figma.js';

interface TokenLeaf {
  $value: string | number;
  $type?: string;
}
type TokenTree = { [k: string]: TokenLeaf | TokenTree };

function smallFigmaFixture(): TokenTree {
  return {
    color: {
      primary: { $value: '#3b82f6', $type: 'color' },
      'fg.muted': { $value: '#6b7280', $type: 'color' },
    },
    spacing: {
      sm: { $value: '8px', $type: 'dimension' },
      md: { $value: '16px', $type: 'dimension' },
    },
    radius: {
      sm: { $value: '4px', $type: 'dimension' },
      md: { $value: '8px', $type: 'dimension' },
    },
    shadow: {
      sm: { $value: '0 1px 2px rgba(0,0,0,0.06)', $type: 'shadow' },
    },
    duration: {
      fast: { $value: '120ms', $type: 'duration' },
      normal: { $value: '0.2s', $type: 'duration' },
    },
    easing: {
      in_out: { $value: 'cubic-bezier(.4,0,.2,1)' },
    },
    typography: {
      fontFamily: { $value: 'Inter, system-ui, sans-serif' },
      size: {
        base: { $value: '14px' },
        lg: { $value: '16px' },
      },
      weight: {
        bold: { $value: '700' },
      },
    },
    // Some unrecognized buckets — should land in `unmapped` and warn.
    layers: {
      surface: { $value: '#fff' },
    },
  };
}

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'cir-import-figma-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('convertTokens', () => {
  it('routes color, spacing, radius, shadow, motion and typography tokens', () => {
    const result = convertTokens(smallFigmaFixture(), { id: 'cir.test', version: '0.1.0' });
    const kit = result.brandKit;

    expect(kit.id).toBe('cir.test');
    expect(kit.version).toBe('0.1.0');
    expect(kit.tokens.colors['primary']).toBe('#3b82f6');
    expect(kit.tokens.spacing['md']).toBe('16px');
    expect(kit.tokens.typography.font_stack).toContain('Inter');
    expect(kit.tokens.typography.scale['lg']).toBe('16px');
    expect(kit.tokens.typography.weight?.['bold']).toBe('700');
    expect(kit.radius_scale?.['sm']).toBe('4px');
    expect(kit.shadow_scale?.['sm']).toContain('rgba');
    expect(kit.motion?.duration_scale['fast']).toBe(120);
    expect(kit.motion?.duration_scale['normal']).toBe(200);
    expect(kit.motion?.easing?.['in_out']).toContain('cubic-bezier');
  });

  it('reports unmapped tokens', () => {
    const result = convertTokens(smallFigmaFixture());
    expect(result.unmapped).toContain('layers.surface');
  });

  it('produces a BrandKit that round-trips through BrandKitSchema', () => {
    const result = convertTokens(smallFigmaFixture());
    const parsed = BrandKitSchema.safeParse(result.brandKit);
    expect(parsed.success).toBe(true);
  });

  it('warns when no color tokens are supplied', () => {
    const result = convertTokens({ spacing: { md: { $value: '16px' } } });
    expect(result.warnings.some((w) => w.includes('color'))).toBe(true);
  });

  it('skips a token whose duration cannot be parsed', () => {
    const result = convertTokens({
      duration: { lazy: { $value: 'eventually' } },
    });
    expect(result.warnings.some((w) => w.includes('duration'))).toBe(true);
    expect(result.unmapped).toContain('duration.lazy');
  });

  it('uses defaults when font + scale are missing', () => {
    const result = convertTokens({
      color: { primary: { $value: '#000' } },
      spacing: { md: { $value: '16px' } },
    });
    expect(result.brandKit.tokens.typography.font_stack).toContain('system-ui');
    expect(result.brandKit.tokens.typography.scale['base']).toBe('14px');
  });
});

describe('durationToMs', () => {
  it('parses ms strings', () => {
    expect(durationToMs('120ms')).toBe(120);
  });
  it('parses seconds strings', () => {
    expect(durationToMs('0.32s')).toBe(320);
  });
  it('takes numbers as ms', () => {
    expect(durationToMs(200)).toBe(200);
  });
  it('returns null for noise', () => {
    expect(durationToMs('eventually')).toBeNull();
  });
});

describe('importFigma CLI entry', () => {
  it('writes a schema-valid BrandKit JSON file', async () => {
    const specPath = join(tmp, 'tokens.json');
    const outPath = join(tmp, 'brand-kit.json');
    await writeFile(specPath, JSON.stringify(smallFigmaFixture()), 'utf8');
    await importFigma([specPath, '--out', outPath, '--id', 'cir.figma', '--version', '1.2.3']);
    const raw = await readFile(outPath, 'utf8');
    const parsed = BrandKitSchema.parse(JSON.parse(raw));
    expect(parsed.id).toBe('cir.figma');
    expect(parsed.version).toBe('1.2.3');
    expect(parsed.radius_scale?.['md']).toBe('8px');
    expect(parsed.motion?.duration_scale['fast']).toBe(120);
  });

  it('throws on a missing input file', async () => {
    await expect(
      importFigma([join(tmp, 'does-not-exist.json'), '--out', join(tmp, 'out.json')]),
    ).rejects.toThrow(/not found/);
  });

  it('throws on malformed JSON input', async () => {
    const specPath = join(tmp, 'tokens.json');
    await writeFile(specPath, '{not-json', 'utf8');
    await expect(importFigma([specPath, '--out', join(tmp, 'out.json')])).rejects.toThrow(
      /parse JSON/,
    );
  });

  it('honours --dry-run by not writing the output file', async () => {
    const specPath = join(tmp, 'tokens.json');
    const outPath = join(tmp, 'brand-kit.json');
    await writeFile(specPath, JSON.stringify(smallFigmaFixture()), 'utf8');
    await importFigma([specPath, '--out', outPath, '--dry-run']);
    await expect(readFile(outPath, 'utf8')).rejects.toThrow();
  });

  it('throws when --help is rendered without args missing', async () => {
    await expect(importFigma([])).rejects.toThrow(/missing required argument/);
  });
});
