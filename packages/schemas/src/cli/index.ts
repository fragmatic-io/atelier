#!/usr/bin/env -S node --import=tsx/esm
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/* eslint-disable no-console */
/**
 * `atelier-schemas` CLI.
 *
 *   atelier-schemas dump [--out <dir>]
 *     Writes one JSON Schema per registered schema to <dir>.
 *     Default <dir>: `.well-known/schemas/` (relative to cwd).
 *
 *   atelier-schemas validate-data [--root <dir>] [--strict]
 *     Walks the Atelier data directories (capabilities/, recipes/, ...) under
 *     <dir> (default: cwd) and validates every *.json file against the
 *     schema mapped to that directory by `PATH_DISPATCH`.
 *
 *     `--strict` is the CI gate. With `--strict`, any capability whose
 *     `_review.needs` array is non-empty fails validation — these are
 *     unreviewed drafts produced by the OpenAPI importer (see
 *     `cir import openapi`). The check applies ONLY to capabilities; other
 *     schemas (skill, policy, manifest, …) do not have a `_review` envelope.
 *
 *     Without `--strict`, behavior is unchanged: schema validation only,
 *     `_review` envelope is optional → permissive. PR builds and
 *     `pnpm validate` should run with `--strict`; local
 *     `atelier-schemas validate-data` is permissive so a developer can iterate
 *     on a draft import without CI yelling at them mid-keystroke.
 *
 * Implementation notes:
 *  - This file is invoked via shebang (`node --experimental-strip-types`)
 *    in dev. In CI/published form, `pnpm exec atelier-schemas` resolves the
 *    package's bin entry through `tsx`-equivalent strip-types loader.
 *  - Kept under ~200 lines: argv parsed by hand, no UX libraries.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import fg from 'fast-glob';
import Ajv2019 from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';
import { ZodError } from 'zod';
import { toJsonSchema } from '../json-schema.js';
import { parseSkillMarkdown } from '../skill-parser.js';
import { MARKDOWN_DISPATCH, PATH_DISPATCH, SCHEMA_REGISTRY } from './registry.js';

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

/**
 * Inspect a parsed capability for an unreviewed `_review.needs` list. Returns
 * the outstanding entries (or `null` when the capability is cleared / has no
 * envelope at all). Hand-authored capabilities have no `_review` field and
 * always return `null`.
 *
 * Exported indirectly through `validateData`; not part of the public API.
 */
function unreviewedNeeds(data: unknown): readonly string[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const review = (data as { _review?: unknown })._review;
  if (typeof review !== 'object' || review === null) return null;
  const needs = (review as { needs?: unknown }).needs;
  if (!Array.isArray(needs) || needs.length === 0) return null;
  return needs.filter((n): n is string => typeof n === 'string');
}

async function validateData(rootDir: string, strict: boolean): Promise<number> {
  const ajv = new Ajv2019({ allErrors: true, strict: false });
  addFormats(ajv);

  // Pre-compile every schema once.
  const validators = new Map<string, ReturnType<typeof ajv.compile>>();
  for (const { name, schema } of SCHEMA_REGISTRY) {
    validators.set(name, ajv.compile(toJsonSchema(schema, { name })));
  }

  let failures = 0;
  let total = 0;
  for (const { dir, schemaName, fileOverrides } of PATH_DISPATCH) {
    const abs = resolve(rootDir, dir);
    if (!existsSync(abs)) {
      continue;
    }
    const defaultValidator = validators.get(schemaName);
    if (!defaultValidator) {
      console.error(`no validator for ${schemaName}`);
      failures++;
      continue;
    }
    const files = await fg('**/*.json', { cwd: abs, absolute: true });
    for (const file of files) {
      total++;
      // Pick schema by per-file override (keyed on basename relative to
      // `dir`) before falling through to the directory's default schema.
      // The strict review-envelope gate keys on the EFFECTIVE schema name
      // — only `capability` carries a `_review` envelope today, so other
      // overridden files (e.g. `composition-rules`) are silently skipped
      // by the strict check.
      const rel = relative(abs, file);
      const overrideName = fileOverrides?.[rel];
      const effectiveSchemaName = overrideName ?? schemaName;
      const validator = overrideName ? validators.get(overrideName) : defaultValidator;
      if (!validator) {
        console.error(`no validator for ${effectiveSchemaName}`);
        failures++;
        continue;
      }
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
        console.error(`INVALID  ${relative(rootDir, file)} (schema=${effectiveSchemaName})`);
        for (const e of validator.errors ?? []) {
          console.error(`         ${e.instancePath || '/'} ${e.message ?? ''}`);
        }
        continue;
      }
      // --strict: capability files with non-empty `_review.needs` fail.
      // Other schemas (skill, manifest, policy, …) have no `_review`, so this
      // check is silent for them.
      if (strict && effectiveSchemaName === 'capability') {
        const outstanding = unreviewedNeeds(data);
        if (outstanding) {
          failures++;
          console.error(
            `${relative(rootDir, file)}: ${outstanding.length} review item(s) outstanding ` +
              `(${outstanding.join(', ')})`,
          );
        }
      }
    }
  }

  // Markdown dispatch — skills/, etc.
  for (const { dir, glob, kind } of MARKDOWN_DISPATCH) {
    const abs = resolve(rootDir, dir);
    if (!existsSync(abs)) {
      continue;
    }
    const files = await fg(glob, { cwd: abs, absolute: true });
    for (const file of files) {
      total++;
      const raw = await readFile(file, 'utf8');
      try {
        if (kind === 'skill') {
          parseSkillMarkdown(raw);
        }
      } catch (err) {
        failures++;
        console.error(`INVALID  ${relative(rootDir, file)} (kind=${kind})`);
        if (err instanceof ZodError) {
          for (const issue of err.issues) {
            const path = issue.path.length > 0 ? `/${issue.path.join('/')}` : '/';
            console.error(`         ${path} ${issue.message}`);
          }
        } else {
          console.error(`         ${(err as Error).message}`);
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
      // Boolean flag: any presence of --strict enables strict mode. The
      // simple parser stores 'true' for valueless flags, but a user passing
      // `--strict <positional>` would also enable it (which is the desired
      // intent if they typed --strict at all).
      const strict = 'strict' in flags;
      const code = await validateData(resolve(root), strict);
      process.exit(code);
      break;
    }
    default: {
      console.error(
        `usage: atelier-schemas <dump|validate-data> [--out <dir>] [--root <dir>] [--strict]`,
      );
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
