// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * License header check.
 *
 * Walks the in-scope TypeScript/JavaScript source files in this repo and
 * verifies that each one starts with an SPDX Apache-2.0 header. Wired into
 * `pnpm validate` so CI fails fast when a header is missing.
 *
 * Usage:
 *   tsx scripts/check-license-headers.ts          # report and exit 1 on miss
 *   tsx scripts/check-license-headers.ts --fix    # prepend missing headers
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fg from 'fast-glob';

const ROOT = resolve(import.meta.dirname, '..');

const INCLUDE = [
  'packages/*/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
  'platform/packages/*/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
  'platform/apps/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
  'platform/scripts/**/*.{ts,mts,cts,js,mjs,cjs}',
  'scripts/**/*.{ts,mts,cts,js,mjs,cjs}',
  'eslint.config.js',
  'vitest.config.ts',
  'commitlint.config.js',
];

const EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/test/**',
  '**/__tests__/**',
  '**/*.d.ts',
  '**/golden/**',
];

const SPDX_LINE = 'SPDX-License-Identifier: MIT';
const HEADER = `// ${SPDX_LINE}\n// Copyright (c) 2026 The Atelier Authors\n`;
// Match the SPDX line inside `//`, `#`, or `/* ... */` style comments.
// Accept both MIT (current) and Apache-2.0 (legacy, transitional) so a partial
// migration doesn't blow up CI mid-flight.
const SPDX_RE = /(^|\s)SPDX-License-Identifier:\s*(MIT|Apache-2\.0)/;

const fix = process.argv.includes('--fix');

async function findFiles(): Promise<string[]> {
  const files = await fg(INCLUDE, {
    cwd: ROOT,
    ignore: EXCLUDE,
    dot: false,
    onlyFiles: true,
    absolute: true,
    unique: true,
  });
  return files.sort();
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function hasHeader(content: string): boolean {
  // Inspect the first ~10 lines so we tolerate shebangs and short preambles
  // without scanning the entire file.
  const head = stripBom(content).split(/\r?\n/, 10).join('\n');
  return SPDX_RE.test(head);
}

function insertHeader(content: string): string {
  const hadBom = content.charCodeAt(0) === 0xfeff;
  const body = hadBom ? content.slice(1) : content;
  const bom = hadBom ? '﻿' : '';
  if (body.startsWith('#!')) {
    const nl = body.indexOf('\n');
    if (nl === -1) return `${bom}${body}\n${HEADER}`;
    return `${bom}${body.slice(0, nl + 1)}${HEADER}${body.slice(nl + 1)}`;
  }
  return `${bom}${HEADER}${body}`;
}

async function main(): Promise<void> {
  const files = await findFiles();
  const missing: string[] = [];
  const fixed: string[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (hasHeader(content)) continue;
    if (fix) {
      await writeFile(file, insertHeader(content), 'utf8');
      fixed.push(file);
    } else {
      missing.push(file);
    }
  }

  if (fix) {
    if (fixed.length === 0) {
      console.warn(`license-headers: nothing to fix (${files.length} files scanned)`);
      return;
    }
    console.warn(`license-headers: inserted header in ${fixed.length} file(s):`);
    for (const f of fixed) console.warn(`  ${f}:1`);
    return;
  }

  if (missing.length === 0) {
    console.warn(`license-headers: ok (${files.length} files scanned)`);
    return;
  }

  console.error(`license-headers: ${missing.length} file(s) missing SPDX header:`);
  for (const f of missing) console.error(`  ${f}:1`);
  console.error('Run `pnpm fix:license-headers` to insert.');
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error('license-headers: unexpected error');
  console.error(err);
  process.exit(1);
});
