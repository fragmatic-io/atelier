// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Verifies that every shipped template uses only the documented placeholder
 * set (`{{appName}}`, `{{description}}`) and that, after substitution with
 * a sample context, no `{{...}}` markers remain. Catches the common bug
 * where a template adds a new placeholder without updating
 * `applyTemplate`'s replace map.
 *
 * Also asserts that templates load from the filesystem location callers
 * resolve them from — i.e. the `templates/` directory is a sibling to
 * both `src/` and `dist/` and the engine's `templatesRoot()` returns a
 * real path.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  applyTemplate,
  destPath,
  findPlaceholders,
  KNOWN_PLACEHOLDERS,
  listTemplateFiles,
  templatesRoot,
} from '../src/template-engine.js';

describe('template-engine', () => {
  it('templatesRoot() resolves to a real directory', () => {
    const root = templatesRoot();
    expect(existsSync(root)).toBe(true);
    expect(existsSync(join(root, '_shared'))).toBe(true);
    expect(existsSync(join(root, 'next15'))).toBe(true);
    expect(existsSync(join(root, 'vite'))).toBe(true);
  });

  it('destPath strips a single .template suffix', () => {
    expect(destPath('package.json.template')).toBe('package.json');
    expect(destPath('lib/atelier-server.ts.template')).toBe('lib/atelier-server.ts');
    expect(destPath('plain.json')).toBe('plain.json');
    expect(destPath('foo.template.bak')).toBe('foo.template.bak');
  });

  it('applyTemplate substitutes appName + description', () => {
    const out = applyTemplate('hello {{appName}} — {{description}}', {
      appName: 'iris',
      description: 'a flower app',
    });
    expect(out).toBe('hello iris — a flower app');
  });

  it('findPlaceholders surfaces every {{key}} in a string', () => {
    expect(findPlaceholders('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
    expect(findPlaceholders('no markers here')).toEqual([]);
  });
});

describe('shipped templates', () => {
  const ctx = {
    appName: 'sample-app',
    description: 'A descriptive sample.',
  };

  for (const host of ['_shared', 'next15', 'vite'] as const) {
    it(`${host}: every *.template file uses only known placeholders`, async () => {
      const root = templatesRoot();
      const files = await listTemplateFiles(join(root, host));
      for (const rel of files) {
        if (!rel.endsWith('.template')) continue;
        const raw = await readFile(join(root, host, rel), 'utf8');
        const placeholders = findPlaceholders(raw);
        for (const k of placeholders) {
          expect(KNOWN_PLACEHOLDERS, `${host}/${rel}`).toContain(k);
        }
      }
    });

    it(`${host}: substitution leaves no unresolved {{...}} markers`, async () => {
      const root = templatesRoot();
      const files = await listTemplateFiles(join(root, host));
      for (const rel of files) {
        if (!rel.endsWith('.template')) continue;
        const raw = await readFile(join(root, host, rel), 'utf8');
        const rendered = applyTemplate(raw, ctx);
        expect(findPlaceholders(rendered), `${host}/${rel}`).toEqual([]);
      }
    });
  }

  it('next15: package.json template parses + has the spec-required deps', async () => {
    const root = templatesRoot();
    const raw = await readFile(join(root, 'next15', 'package.json.template'), 'utf8');
    const rendered = applyTemplate(raw, ctx);
    const pkg = JSON.parse(rendered) as {
      name: string;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('sample-app');
    for (const dep of [
      '@atelier/runtime',
      '@atelier/react',
      '@atelier/components',
      '@atelier/compiler',
    ]) {
      expect(pkg.dependencies[dep], dep).toBeDefined();
      expect(pkg.dependencies[dep], dep).not.toMatch(/workspace:/);
    }
  });

  it('vite: package.json template parses + ships vite + react devDeps', async () => {
    const root = templatesRoot();
    const raw = await readFile(join(root, 'vite', 'package.json.template'), 'utf8');
    const rendered = applyTemplate(raw, ctx);
    const pkg = JSON.parse(rendered) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('sample-app');
    expect(pkg.devDependencies['vite']).toBeDefined();
    expect(pkg.devDependencies['@vitejs/plugin-react']).toBeDefined();
    expect(pkg.dependencies['@atelier/runtime']).toBeDefined();
    expect(pkg.dependencies['@atelier/runtime']).not.toMatch(/workspace:/);
  });

  it('_shared: brand-kit template parses as valid JSON after substitution', async () => {
    const root = templatesRoot();
    const raw = await readFile(join(root, '_shared', 'brand-kit.json.template'), 'utf8');
    const rendered = applyTemplate(raw, ctx);
    const brand = JSON.parse(rendered) as { id: string };
    expect(brand.id).toBe('sample-app.brand');
  });
});
