// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir components sync` — emit `/components/registry.json` from the
 * code-side `@cir/components` registry.
 *
 * The code-side artifacts (`COMPONENT_BINDINGS`, `TEXT_RENDERERS`) live in
 * `@cir/components/src/registry.ts` and `@cir/components/src/text-render.ts`.
 * This script projects them into the public registry shape that
 * `ComponentRegistrySchema` (in `@cir/schemas`) validates: a bare
 * `Record<ComponentId, ComponentDefinition>`. The `validate-data` CLI walks
 * `components/` and validates whatever JSON it finds, so once we emit the
 * file the catalog has a real, validated artifact.
 *
 * Usage:
 *   tsx scripts/sync-component-registry.ts          # write components/registry.json
 *   tsx scripts/sync-component-registry.ts --check  # diff vs disk; exit 1 on drift
 *
 * Schema match:
 *   `ComponentRegistrySchema = z.record(ComponentId, ComponentDefinitionSchema)`
 *   is a *bare record* — it has no top-level `version`/`generated_at`
 *   envelope and no slot for composition rules. We therefore emit the bare
 *   record. The `COMPOSITION_RULES` exported by `@cir/components` use a
 *   `'leaf'` sentinel that the current `CompositionRuleSchema` does not
 *   accept either, so they are deliberately not emitted here. Both the
 *   envelope and the composition rules will need schema work before they
 *   can ride along.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import * as prettier from 'prettier';

import { COMPONENT_BINDINGS, TEXT_RENDERERS } from '@cir/components';
import {
  ComponentRegistrySchema,
  type ComponentDefinition,
  type ComponentRegistry,
} from '@cir/schemas';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_PATH = resolve(ROOT, 'components/registry.json');
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
function buildRegistry(componentsVersion: string): ComponentRegistry {
  const designTokens = `@cir/components/baseline@${componentsVersion}`;
  const ids = Object.keys(COMPONENT_BINDINGS).sort();
  const out: Record<string, ComponentDefinition> = {};
  for (const id of ids) {
    const def: ComponentDefinition = {
      props_schema: `${id}Props`,
      data_sources: [],
      actions_supported: [],
      responsive_targets: ['web'],
      design_tokens: designTokens,
      examples: [],
      text_render: TEXT_RENDERERS[id] !== undefined,
    };
    out[id] = def;
  }
  return out;
}

/**
 * Stable, prettier-formatted JSON serialization with sorted keys at every
 * level. Running through prettier means the output matches whatever the
 * repo's `pnpm format:check` step expects, so the file will not bounce on
 * format-on-save or pre-commit hooks.
 */
async function stableStringify(value: unknown): Promise<string> {
  const sorted = JSON.stringify(value, sortReplacer, 2);
  // Resolve config relative to the output path so prettier picks up the
  // repo's `.prettierrc.json` settings.
  const config = await prettier.resolveConfig(OUT_PATH);
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

async function readExisting(): Promise<string | undefined> {
  if (!existsSync(OUT_PATH)) return undefined;
  return readFile(OUT_PATH, 'utf8');
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');

  const version = await readPackageVersion();
  const registry = buildRegistry(version);

  // Validate before writing — refuse to emit invalid output.
  const parsed = ComponentRegistrySchema.parse(registry);
  const serialized = await stableStringify(parsed);

  if (check) {
    const existing = await readExisting();
    if (existing === undefined) {
      console.error(
        `components:check: ${OUT_PATH} is missing. Run \`pnpm components:sync\` to generate it.`,
      );
      process.exit(1);
    }
    if (existing !== serialized) {
      console.error(
        `components:check: drift detected — components/registry.json is stale.\n` +
          `  Run \`pnpm components:sync\` to regenerate from @cir/components.`,
      );
      // Print a small unified-style hint so CI logs surface the change.
      const existingIds = extractIds(existing);
      const generatedIds = Object.keys(registry).sort();
      const removed = existingIds.filter((id) => !generatedIds.includes(id));
      const added = generatedIds.filter((id) => !existingIds.includes(id));
      if (removed.length > 0) console.error(`  removed: ${removed.join(', ')}`);
      if (added.length > 0) console.error(`  added:   ${added.join(', ')}`);
      process.exit(1);
    }
    console.warn(
      `components:check: ok (${Object.keys(registry).length} component(s), ${OUT_PATH})`,
    );
    return;
  }

  await writeFile(OUT_PATH, serialized, 'utf8');
  console.warn(
    `components:sync: wrote ${Object.keys(registry).length} component(s) to ${OUT_PATH}`,
  );
}

function extractIds(serialized: string): string[] {
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    return Object.keys(parsed).sort();
  } catch {
    return [];
  }
}

main().catch((err: unknown) => {
  console.error('components:sync: unexpected error');
  console.error(err);
  process.exit(1);
});
