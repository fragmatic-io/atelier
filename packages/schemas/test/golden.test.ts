// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Golden test for the JSON Schema dumps.
 *
 * Re-emits every registered schema to a temp directory and diffs against
 * `test/golden/`. Any drift fails the test — that means the orchestrator
 * (or a careless commit) accidentally changed the public schema shape and
 * needs to refresh the goldens deliberately.
 *
 * Refresh procedure:
 *
 *     pnpm exec cir-schemas dump --out packages/schemas/test/golden/
 *     git diff packages/schemas/test/golden/
 *     # review the diff carefully (it's a public API change)
 *     git add packages/schemas/test/golden/
 */

import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SCHEMA_REGISTRY } from '../src/cli/registry.js';
import { toJsonSchema } from '../src/json-schema.js';

const GOLDEN_DIR = new URL('./golden/', import.meta.url).pathname;

describe('golden JSON schemas', () => {
  it('are byte-identical to a fresh dump', async () => {
    const out = await mkdtemp(join(tmpdir(), 'cir-schemas-golden-'));
    for (const { name, schema } of SCHEMA_REGISTRY) {
      const json = toJsonSchema(schema, { name });
      const path = join(out, `${name}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    }

    for (const { name } of SCHEMA_REGISTRY) {
      const fresh = await readFile(join(out, `${name}.json`), 'utf8');
      const golden = await readFile(join(GOLDEN_DIR, `${name}.json`), 'utf8');
      expect(fresh, `golden drift in ${name}.json`).toBe(golden);
    }
  });
});
