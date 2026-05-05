// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Atelier-specific schema validators for `atelier validate`.
 *
 * One runner per artefact directory. Each walks the directory under the
 * project root, parses every file, and applies the appropriate Zod schema
 * from `@atelier/schemas`. Validators short-circuit to `skip` when the
 * source directory does not exist — the consumer simply isn't using that
 * shape today.
 *
 * Shape mapping (mirrors `packages/schemas/src/cli/registry.ts`):
 *   - `capabilities/*.json`        → `CapabilitySchema`
 *   - `skills/**\/*.skill.md`      → `parseSkillMarkdown` (YAML+SkillSchema)
 *   - `policies/*.json`            → `PolicySchema`
 *   - `recipes/*.json`             → `ManifestSchema`
 *   - `brand-kit.json`             → `BrandKitSchema`
 *   - `components/registry.json`   → `ComponentRegistrySchema`
 *
 * Errors are reported one per offending file. The Zod issue list is
 * collapsed into a single per-file `message` so the report stays tabular;
 * `--json` exposes the full list.
 */

import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  BrandKitSchema,
  CapabilitySchema,
  ComponentRegistrySchema,
  ManifestSchema,
  parseSkillMarkdown,
  PolicySchema,
  ZodError,
} from '@atelier/schemas';

import type { DetectedStack } from '../detect-stack.js';
import { listFilesRecursive, listJsonFiles } from '../detect-stack.js';
import type { ValidatorIssue, ValidatorResult } from './index.js';

/**
 * Minimal duck-typed schema interface — every Zod schema exposes `.parse`.
 * We don't import `ZodSchema` from `zod` directly so the CLI doesn't take
 * a runtime dep on `zod` (it gets it transitively through `@atelier/schemas`,
 * but the type-only import isn't a fight worth picking).
 */
interface ParseShape {
  parse: (data: unknown) => unknown;
}

/** capabilities/*.json → CapabilitySchema. Walks subdirectories. */
export async function runCapabilitiesValidator(stack: DetectedStack): Promise<ValidatorResult> {
  return runJsonShapeValidator({
    stack,
    id: 'capabilities',
    label: 'Capabilities',
    detected: stack.hasCapabilities,
    detectMissReason: 'no capabilities/ directory',
    dir: join(stack.root, 'capabilities'),
    scope: './capabilities/',
    schema: CapabilitySchema,
    recursive: true,
    // `_index.json` summaries inside `capabilities/` are validated against
    // `CapabilityIndex`, not `Capability`. They are generated artefacts;
    // skip them here so we don't need a second registry.
    fileFilter: (abs) => !abs.endsWith('_index.json'),
  });
}

/** policies/*.json → PolicySchema. */
export async function runPoliciesValidator(stack: DetectedStack): Promise<ValidatorResult> {
  return runJsonShapeValidator({
    stack,
    id: 'policies',
    label: 'Policies',
    detected: stack.hasPolicies,
    detectMissReason: 'no policies/ directory',
    dir: join(stack.root, 'policies'),
    scope: './policies/',
    schema: PolicySchema,
  });
}

/** recipes/*.json → ManifestSchema (recipes are pre-built manifest fragments). */
export async function runRecipesValidator(stack: DetectedStack): Promise<ValidatorResult> {
  return runJsonShapeValidator({
    stack,
    id: 'recipes',
    label: 'Recipes',
    detected: stack.hasRecipes,
    detectMissReason: 'no recipes/ directory',
    dir: join(stack.root, 'recipes'),
    scope: './recipes/',
    schema: ManifestSchema,
  });
}

/** brand-kit.json (single file) → BrandKitSchema. */
export async function runBrandKitValidator(stack: DetectedStack): Promise<ValidatorResult> {
  const start = Date.now();
  const file = join(stack.root, 'brand-kit.json');
  if (!stack.hasBrandKit) {
    return {
      id: 'brandKit',
      label: 'Brand kit',
      status: 'skip',
      scope: './brand-kit.json',
      fileCount: null,
      errorCount: null,
      reason: 'no brand-kit.json',
      issues: [],
      durationMs: Date.now() - start,
    };
  }
  const issue = await validateOneJson(file, BrandKitSchema, stack.root);
  if (issue) {
    return {
      id: 'brandKit',
      label: 'Brand kit',
      status: 'fail',
      scope: './brand-kit.json',
      fileCount: 1,
      errorCount: 1,
      reason: '1 error(s)',
      issues: [issue],
      durationMs: Date.now() - start,
    };
  }
  return {
    id: 'brandKit',
    label: 'Brand kit',
    status: 'pass',
    scope: './brand-kit.json',
    fileCount: 1,
    errorCount: 0,
    reason: null,
    issues: [],
    durationMs: Date.now() - start,
  };
}

/** components/registry.json → ComponentRegistrySchema. */
export async function runComponentRegistryValidator(
  stack: DetectedStack,
): Promise<ValidatorResult> {
  const start = Date.now();
  const file = join(stack.root, 'components/registry.json');
  if (!stack.hasComponentRegistry) {
    return {
      id: 'componentsRegistry',
      label: 'Components',
      status: 'skip',
      scope: './components/registry.json',
      fileCount: null,
      errorCount: null,
      reason: 'no components/registry.json',
      issues: [],
      durationMs: Date.now() - start,
    };
  }
  const issue = await validateOneJson(file, ComponentRegistrySchema, stack.root);
  if (issue) {
    return {
      id: 'componentsRegistry',
      label: 'Components',
      status: 'fail',
      scope: './components/registry.json',
      fileCount: 1,
      errorCount: 1,
      reason: '1 error(s)',
      issues: [issue],
      durationMs: Date.now() - start,
    };
  }
  return {
    id: 'componentsRegistry',
    label: 'Components',
    status: 'pass',
    scope: './components/registry.json',
    fileCount: 1,
    errorCount: 0,
    reason: null,
    issues: [],
    durationMs: Date.now() - start,
  };
}

/**
 * skills/**\/*.skill.md → parseSkillMarkdown (YAML frontmatter + SkillSchema).
 * Reports per-file failures; YAML errors carry a line number, schema
 * errors carry the JSON path.
 */
export async function runSkillsValidator(stack: DetectedStack): Promise<ValidatorResult> {
  const start = Date.now();
  if (!stack.hasSkills) {
    return {
      id: 'skills',
      label: 'Skills',
      status: 'skip',
      scope: './skills/',
      fileCount: null,
      errorCount: null,
      reason: 'no skills/ directory',
      issues: [],
      durationMs: Date.now() - start,
    };
  }
  const dir = join(stack.root, 'skills');
  const files = listFilesRecursive(dir, (name) => name.endsWith('.skill.md'));
  const issues: ValidatorIssue[] = [];
  for (const file of files) {
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      issues.push({ file, line: null, message: (err as Error).message });
      continue;
    }
    try {
      parseSkillMarkdown(raw);
    } catch (err) {
      issues.push({ file, line: null, message: skillErrorMessage(err) });
    }
  }
  const status: ValidatorResult['status'] = issues.length === 0 ? 'pass' : 'fail';
  return {
    id: 'skills',
    label: 'Skills',
    status,
    scope: relativeScope(stack.root, dir),
    fileCount: files.length,
    errorCount: issues.length,
    reason: status === 'fail' ? `${issues.length} error(s)` : null,
    issues,
    durationMs: Date.now() - start,
  };
}

interface JsonShapeOptions {
  stack: DetectedStack;
  id: ValidatorResult['id'];
  label: string;
  detected: boolean;
  detectMissReason: string;
  dir: string;
  scope: string;
  schema: ParseShape;
  fileFilter?: (abs: string) => boolean;
  /** When true, walk subdirectories. Defaults to false (single-level scan). */
  recursive?: boolean;
}

/**
 * Shared loop for the three "directory of *.json" validators
 * (capabilities, policies, recipes). The shape repeats often enough that
 * extracting it keeps the per-validator file readable.
 */
async function runJsonShapeValidator(opts: JsonShapeOptions): Promise<ValidatorResult> {
  const start = Date.now();
  if (!opts.detected) {
    return {
      id: opts.id,
      label: opts.label,
      status: 'skip',
      scope: opts.scope,
      fileCount: null,
      errorCount: null,
      reason: opts.detectMissReason,
      issues: [],
      durationMs: Date.now() - start,
    };
  }
  const allFiles = opts.recursive
    ? listFilesRecursive(opts.dir, (name) => name.endsWith('.json'))
    : listJsonFiles(opts.dir);
  const files = opts.fileFilter ? allFiles.filter(opts.fileFilter) : allFiles;
  const issues: ValidatorIssue[] = [];
  for (const file of files) {
    const issue = await validateOneJson(file, opts.schema, opts.stack.root);
    if (issue) issues.push(issue);
  }
  const status: ValidatorResult['status'] = issues.length === 0 ? 'pass' : 'fail';
  return {
    id: opts.id,
    label: opts.label,
    status,
    scope: opts.scope,
    fileCount: files.length,
    errorCount: issues.length,
    reason: status === 'fail' ? `${issues.length} error(s)` : null,
    issues,
    durationMs: Date.now() - start,
  };
}

/**
 * Read + parse + validate one JSON file. Returns a single `ValidatorIssue`
 * on failure, `null` on success. Collapses Zod's full issue list into one
 * message to keep the table tidy; `--json` consumers re-inspect the file
 * if they need detail.
 */
async function validateOneJson(
  file: string,
  schema: ParseShape,
  root: string,
): Promise<ValidatorIssue | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    return { file, line: null, message: `read failed: ${(err as Error).message}` };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return {
      file,
      line: null,
      message: `JSON parse: ${(err as Error).message}`,
    };
  }
  try {
    schema.parse(data);
    return null;
  } catch (err) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const path = first && first.path.length > 0 ? `/${first.path.map(String).join('/')}` : '/';
      const more = err.issues.length > 1 ? ` (+${err.issues.length - 1} more)` : '';
      const msg = first ? `${path} ${first.message}${more}` : 'schema error';
      return { file, line: null, message: msg };
    }
    void root; // keep signature consistent; relative path lookup not needed today
    return { file, line: null, message: (err as Error).message };
  }
}

function skillErrorMessage(err: unknown): string {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first && first.path.length > 0 ? `/${first.path.map(String).join('/')}` : '/';
    const more = err.issues.length > 1 ? ` (+${err.issues.length - 1} more)` : '';
    return first ? `${path} ${first.message}${more}` : 'schema error';
  }
  // SkillParseError carries a `reason` + `line` + `column`. We dodge an
  // import cycle by duck-typing.
  if (err && typeof err === 'object' && 'reason' in err) {
    const e = err as { reason: string; line?: number; column?: number };
    if (e.line !== undefined && e.column !== undefined) {
      return `${e.line}:${e.column} ${e.reason}`;
    }
    return e.reason;
  }
  return err instanceof Error ? err.message : String(err);
}

function relativeScope(root: string, abs: string): string {
  const rel = relative(root, abs);
  if (rel === '' || rel === '.') return './';
  return `./${rel}/`;
}
