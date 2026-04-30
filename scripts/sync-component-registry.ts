// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir components sync` — emit `/components/registry.json` and
 * `/components/composition-rules.json` from the code-side `@cir/components`
 * registry.
 *
 * The code-side artifacts (`COMPONENT_BINDINGS`, `COMPONENT_METADATA`,
 * `COMPOSITION_RULES`, `TEXT_RENDERERS`) live in
 * `@cir/components/src/registry.ts` and `@cir/components/src/text-render.ts`.
 * This script projects them into the public registry shapes that
 * `ComponentRegistrySchema` and `CompositionRulesSchema` (in `@cir/schemas`)
 * validate. The `validate-data` CLI walks `components/` and validates each
 * JSON file against the right schema (per `PATH_DISPATCH` overrides).
 *
 * Usage:
 *   tsx scripts/sync-component-registry.ts          # write both files
 *   tsx scripts/sync-component-registry.ts --check  # diff vs disk; exit 1 on drift
 *
 * Both files are golden artifacts; `--check` fails if either is missing or
 * stale. The composition-rules sibling rides alongside the registry because
 * `CompositionRulesSchema` is a sibling structure to `ComponentRegistrySchema`
 * (both are bare `Record<ComponentId, …>` shapes — no envelope).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

import {
  COMPONENT_BINDINGS,
  COMPONENT_METADATA,
  COMPOSITION_RULES,
  TEXT_RENDERERS,
} from '@cir/components';
import {
  ComponentRegistrySchema,
  CompositionRulesSchema,
  type ComponentDefinition,
  type ComponentRegistry,
  type CompositionRules,
} from '@cir/schemas';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_PATH = resolve(ROOT, 'components/registry.json');
const RULES_PATH = resolve(ROOT, 'components/composition-rules.json');
const COMPONENTS_PKG_JSON = resolve(ROOT, 'packages/components/package.json');

interface PackageJson {
  version: string;
}

async function readPackageVersion(): Promise<string> {
  const raw = await readFile(COMPONENTS_PKG_JSON, 'utf8');
  const pkg = JSON.parse(raw) as PackageJson;
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error(`packages/components/package.json: missing or empty "version"`);
  }
  return pkg.version;
}

/** Builds the bare-record registry from the code-side bindings. */
export function buildRegistry(componentsVersion: string): ComponentRegistry {
  const designTokens = `@cir/components/baseline@${componentsVersion}`;
  const ids = Object.keys(COMPONENT_BINDINGS).sort();
  const out: Record<string, ComponentDefinition> = {};
  for (const id of ids) {
    const meta = COMPONENT_METADATA[id];
    const def: ComponentDefinition = {
      props_schema: `${id}Props`,
      // Project optional metadata as concrete arrays. Empty is HONEST —
      // components without a defensible capability binding stay empty
      // (see `COMPONENT_METADATA` in `@cir/components/src/registry.ts`).
      data_sources: meta?.dataSources ? [...meta.dataSources] : [],
      actions_supported: meta?.actionsSupported ? [...meta.actionsSupported] : [],
      responsive_targets: ['web'],
      design_tokens: designTokens,
      examples: meta?.examples ? [...meta.examples] : [],
      text_render: TEXT_RENDERERS[id] !== undefined,
    };
    out[id] = def;
  }
  return out;
}

/**
 * Builds the composition-rules sibling. `CompositionRulesSchema` is a bare
 * `Record<ComponentId, CompositionRule>`. The code-side `'leaf'` sentinel is
 * accepted by the (now-fixed) schema, so this is a straight projection.
 */
export function buildCompositionRules(): CompositionRules {
  const ids = Object.keys(COMPOSITION_RULES).sort();
  const out: Record<string, CompositionRules[string]> = {};
  for (const id of ids) {
    const rule = COMPOSITION_RULES[id];
    if (!rule) continue;
    // Code-side `can_contain` may be a `readonly string[]` (declared `as const`);
    // the schema-side type is a mutable `string[]`. Spread to a mutable copy.
    const rawCanContain = rule.can_contain;
    const canContain: string[] | '*' | 'leaf' =
      typeof rawCanContain === 'string' ? rawCanContain : [...rawCanContain];
    out[id] = {
      can_contain: canContain,
      ...(rule.min_children !== undefined ? { min_children: rule.min_children } : {}),
      ...(rule.max_children !== undefined ? { max_children: rule.max_children } : {}),
    };
  }
  return out;
}

/**
 * Stable, prettier-formatted JSON serialization with sorted keys at every
 * level. Running through prettier means the output matches whatever the
 * repo's `pnpm format:check` step expects, so the file will not bounce on
 * format-on-save or pre-commit hooks.
 *
 * `anchorPath` resolves prettier config — both output files live in the
 * same directory so it doesn't really matter which we pick, but we keep the
 * parameter explicit for clarity and future-proofing.
 */
async function stableStringify(value: unknown, anchorPath: string = OUT_PATH): Promise<string> {
  const sorted = JSON.stringify(value, sortReplacer, 2);
  const config = await prettier.resolveConfig(anchorPath);
  return prettier.format(sorted, { ...config, parser: 'json' });
}

function sortReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}

async function readExistingAt(path: string): Promise<string | undefined> {
  if (!existsSync(path)) return undefined;
  return readFile(path, 'utf8');
}

interface CheckTarget {
  /** Output path on disk. */
  path: string;
  /** Display label used in `--check` failure messages. */
  label: string;
  /** Generator output (already prettier-formatted). */
  serialized: string;
  /** The parsed object — used to surface added/removed key hints on drift. */
  parsed: Record<string, unknown>;
}

async function checkTarget(target: CheckTarget): Promise<boolean> {
  const existing = await readExistingAt(target.path);
  if (existing === undefined) {
    console.error(
      `components:check: ${target.path} is missing. Run \`pnpm components:sync\` to generate it.`,
    );
    return false;
  }
  if (existing !== target.serialized) {
    console.error(
      `components:check: drift detected — ${target.label} is stale.\n` +
        `  Run \`pnpm components:sync\` to regenerate from @cir/components.`,
    );
    const existingIds = extractIds(existing);
    const generatedIds = Object.keys(target.parsed).sort();
    const removed = existingIds.filter((id) => !generatedIds.includes(id));
    const added = generatedIds.filter((id) => !existingIds.includes(id));
    if (removed.length > 0) console.error(`  removed: ${removed.join(', ')}`);
    if (added.length > 0) console.error(`  added:   ${added.join(', ')}`);
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');

  const version = await readPackageVersion();
  const registry = buildRegistry(version);
  const rules = buildCompositionRules();

  // Validate before writing — refuse to emit invalid output.
  const parsedRegistry = ComponentRegistrySchema.parse(registry);
  const parsedRules = CompositionRulesSchema.parse(rules);
  const serializedRegistry = await stableStringify(parsedRegistry, OUT_PATH);
  const serializedRules = await stableStringify(parsedRules, RULES_PATH);

  if (check) {
    const okRegistry = await checkTarget({
      path: OUT_PATH,
      label: 'components/registry.json',
      serialized: serializedRegistry,
      parsed: parsedRegistry,
    });
    const okRules = await checkTarget({
      path: RULES_PATH,
      label: 'components/composition-rules.json',
      serialized: serializedRules,
      parsed: parsedRules,
    });
    if (!okRegistry || !okRules) {
      process.exit(1);
    }
    console.warn(
      `components:check: ok (${Object.keys(registry).length} component(s), ${Object.keys(rules).length} rule(s))`,
    );
    return;
  }

  await writeFile(OUT_PATH, serializedRegistry, 'utf8');
  await writeFile(RULES_PATH, serializedRules, 'utf8');
  console.warn(
    `components:sync: wrote ${Object.keys(registry).length} component(s) to ${OUT_PATH}`,
  );
  console.warn(`components:sync: wrote ${Object.keys(rules).length} rule(s) to ${RULES_PATH}`);
}

function extractIds(serialized: string): string[] {
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    return Object.keys(parsed).sort();
  } catch {
    return [];
  }
}

// Run as a script when invoked directly via `tsx scripts/sync-component-registry.ts`.
// When this module is imported (e.g. by tests using `buildRegistry` /
// `buildCompositionRules`), `main()` is NOT called and no I/O happens at
// import time.
const invokedAsScript = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((err: unknown) => {
    console.error('components:sync: unexpected error');
    console.error(err);
    process.exit(1);
  });
}
