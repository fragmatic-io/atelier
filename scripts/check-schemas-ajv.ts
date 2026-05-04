// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/* eslint-disable no-console */
/**
 * AJV strict-mode gate for generated JSON Schemas.
 *
 * `pnpm schemas:dump` regenerates `.well-known/schemas/*.json` from the Zod
 * sources via `toJsonSchema` (in `@atelier/schemas`). The default
 * `zod-to-json-schema` codegen sometimes emits constructs that AJV's strict
 * mode rejects — most often a `format` keyword (e.g. `"date-time"`) that AJV
 * does not recognize without `ajv-formats`. We don't want to ship that
 * surprise to consumers, so this script:
 *
 *   1. Runs `pnpm schemas:dump` if the output directory is empty (CI safety
 *      net — locally the user has usually already dumped).
 *   2. Loads every `.well-known/schemas/*.json` through `new Ajv({ strict: true })`.
 *   3. Reports per-schema PASS/FAIL and exits non-zero on any compilation
 *      error or strict-mode rejection.
 *
 * Run via: `tsx scripts/check-schemas-ajv.ts` (or `pnpm validate:fast`).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import Ajv2019 from 'ajv/dist/2019.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SCHEMA_DIR = resolve(ROOT, '.well-known/schemas');

function ensureDumped(): void {
  const exists = existsSync(SCHEMA_DIR) && readdirSync(SCHEMA_DIR).some((f) => f.endsWith('.json'));
  if (exists) return;

  console.log('schemas dir empty — running `pnpm schemas:dump`');
  const r = spawnSync('pnpm', ['schemas:dump'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`schemas:dump exited with code ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

function checkAll(): number {
  const files = readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.error(`no JSON schemas found in ${relative(ROOT, SCHEMA_DIR)}`);
    return 1;
  }

  let failures = 0;
  for (const f of files) {
    // Fresh Ajv per schema — keeps `$id` collisions impossible and isolates
    // any strict-mode error to the offending file.
    const ajv = new Ajv2019({ strict: true });
    const path = join(SCHEMA_DIR, f);
    let schema: unknown;
    try {
      schema = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      failures++;
      console.error(`PARSE FAIL ${f}: ${(err as Error).message}`);
      continue;
    }
    try {
      ajv.compile(schema as object);
      console.log(`OK   ${f}`);
    } catch (err) {
      failures++;
      console.error(`FAIL ${f}: ${(err as Error).message}`);
    }
  }

  console.log(`\nchecked ${files.length} schema(s), ${failures} failure(s)`);
  return failures === 0 ? 0 : 1;
}

ensureDumped();
process.exit(checkAll());
