#!/usr/bin/env -S node --import=tsx/esm
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/* eslint-disable no-console */
/**
 * `cir-schemas` CLI.
 *
 *   cir-schemas dump [--out <dir>]
 *     Writes one JSON Schema per registered schema to <dir>.
 *     Default <dir>: `.well-known/schemas/` (relative to cwd).
 *
 *   cir-schemas validate-data [--root <dir>]
 *     Walks the CIR data directories (capabilities/, recipes/, ...) under
 *     <dir> (default: cwd) and validates every *.json file against the
 *     schema mapped to that directory by `PATH_DISPATCH`.
 *
 * Implementation notes:
 *  - This file is invoked via shebang (`node --experimental-strip-types`)
 *    in dev. In CI/published form, `pnpm exec cir-schemas` resolves the
 *    package's bin entry through `tsx`-equivalent strip-types loader.
 *  - Kept under ~150 lines: argv parsed by hand, no UX libraries.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import fg from 'fast-glob';
import Ajv2019 from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';
import { toJsonSchema } from '../json-schema.js';
import { PATH_DISPATCH, SCHEMA_REGISTRY } from './registry.js';

interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? '';
  const flags: Record<string, string> = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a !== undefined && a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    }
  }
  return { command, flags };
}

async function dump(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const { name, schema } of SCHEMA_REGISTRY) {
    const json = toJsonSchema(schema, { name });
    const path = join(outDir, `${name}.json`);
    await writeFile(path, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`wrote ${relative(process.cwd(), path)}`);
  }
}

async function validateData(rootDir: string): Promise<number> {
  const ajv = new Ajv2019({ allErrors: true, strict: false });
  addFormats(ajv);

  // Pre-compile every schema once.
  const validators = new Map<string, ReturnType<typeof ajv.compile>>();
  for (const { name, schema } of SCHEMA_REGISTRY) {
    validators.set(name, ajv.compile(toJsonSchema(schema, { name })));
  }

  let failures = 0;
  let total = 0;
  for (const { dir, schemaName } of PATH_DISPATCH) {
    const abs = resolve(rootDir, dir);
    if (!existsSync(abs)) {
      continue;
    }
    const validator = validators.get(schemaName);
    if (!validator) {
      console.error(`no validator for ${schemaName}`);
      failures++;
      continue;
    }
    const files = await fg('**/*.json', { cwd: abs, absolute: true });
    for (const file of files) {
      total++;
      const raw = await readFile(file, 'utf8');
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        console.error(`PARSE FAIL ${relative(rootDir, file)}: ${(err as Error).message}`);
        failures++;
        continue;
      }
      const ok = validator(data);
      if (!ok) {
        failures++;
        console.error(`INVALID  ${relative(rootDir, file)} (schema=${schemaName})`);
        for (const e of validator.errors ?? []) {
          console.error(`         ${e.instancePath || '/'} ${e.message ?? ''}`);
        }
      }
    }
  }
  console.log(`validated ${total} file(s), ${failures} failure(s)`);
  return failures === 0 ? 0 : 1;
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'dump': {
      const out = flags['out'] ?? '.well-known/schemas';
      await dump(resolve(process.cwd(), out));
      process.exit(0);
      break;
    }
    case 'validate-data': {
      const root = flags['root'] ?? process.cwd();
      const code = await validateData(resolve(root));
      process.exit(code);
      break;
    }
    default: {
      console.error(`usage: cir-schemas <dump|validate-data> [--out <dir>] [--root <dir>]`);
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
