// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * Per-package smoke specs consumed by `scripts/smoke-test-pack.ts`.
 *
 * Each spec packs a single `@atelier/*` workspace package, installs the
 * resulting tarball into a shared scratch dir, then writes a tiny external
 * consumer that imports the documented public surface and uses one
 * representative export so the published `.d.ts` + runtime artifact are
 * exercised end-to-end. A `binCheck` adds a second pass that runs the
 * package's published bin under bare Node.
 *
 * The specs are intentionally verbose (one entry per package) rather than
 * a clever generator: this file is the one place where the "what does an
 * external consumer get" question lives. A regression in any package's
 * exports map shows up here as a precise per-package failure.
 *
 * 15 specs total — must match the published-package set in `packages/`.
 */

export interface SmokeSpecConsumerCheck {
  /** Lines of TypeScript imports prepended to the consumer file. */
  importLines: string[];
  /**
   * Body executed after the imports. Should reference at least one runtime
   * value to keep the import alive under tree-shaking, and at least one type
   * import (declared via `type`) so the published `.d.ts` is exercised.
   */
  sample: string;
}

export interface SmokeSpecBinCheck {
  /** Bin name as published in `package.json#bin` (e.g. `atelier`). */
  binName: string;
  /** Args passed to the bin. */
  args: readonly string[];
  /**
   * Substring expected to appear somewhere in `stdout + stderr` when the bin
   * runs. Matched against the combined output so usage strings printed to
   * stderr (like `atelier-evals` no-op help) still satisfy the check.
   */
  expectStdout: string;
  /**
   * When true, accept a non-zero exit code provided `expectStdout` matches.
   * Use sparingly — only for bins that print usage on stderr + exit 1 by
   * design (e.g. `atelier-evals` with no command).
   */
  allowNonZero?: boolean;
}

export interface SmokeSpec {
  /** Full npm package name, e.g. `@atelier/runtime`. */
  packageName: string;
  /** Argument to `pnpm pack --filter`, equals `packageName` for workspace packs. */
  filterArg: string;
  /**
   * Required tarball entries (relative to the npm `package/` root). Catches
   * regressions in `package.json#files` before they reach npm.
   */
  requiredEntries: readonly string[];
  /** Whether the consumer needs JSX/React types (drives tsconfig + deps). */
  needsReact?: boolean;
  /** Optional extra npm dependencies to install in the scratch dir. */
  extraDeps?: Record<string, string>;
  /** Consumer typecheck + runtime check. */
  consumerCheck: SmokeSpecConsumerCheck;
  /** Optional bin smoke. */
  binCheck?: SmokeSpecBinCheck;
}

// -----------------------------------------------------------------------------
// Sample sources, factored out so the spec list stays readable.
// -----------------------------------------------------------------------------

const CAPABILITY_LITERAL = `{
  id: 'demo.example_archive',
  kind: 'action',
  version: '1.0.0',
  input: { thread_id: { type: 'string' } },
  output: { archived: { type: 'boolean' } },
  side_effects: ['archive', 'mutates:thread_state'],
  permissions: ['thread:write'],
  confirmation: 'inline',
  rate_limit: '100/min/user',
  reversible: true,
  rollback: 'demo.example_unarchive',
}`;

// -----------------------------------------------------------------------------
// 15 specs — one per published package. Order mirrors the dependency graph
// (leaves first) for readability, not behaviour.
// -----------------------------------------------------------------------------

export const SMOKE_SPECS: readonly SmokeSpec[] = [
  // 1. schemas — foundational, no @atelier deps. Has a published bin.
  {
    packageName: '@atelier/schemas',
    filterArg: '@atelier/schemas',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/cli/index.js',
      'package/src/index.ts',
      'package/README.md',
    ],
    consumerCheck: {
      importLines: [`import { CapabilitySchema, type Capability } from '@atelier/schemas';`],
      sample: `const cap: Capability = CapabilitySchema.parse(${CAPABILITY_LITERAL});
if (typeof cap.id !== 'string') throw new Error('expected cap.id string');
console.log('smoke ok:', cap.id);`,
    },
    binCheck: {
      binName: 'atelier-schemas',
      args: ['--help'],
      expectStdout: 'usage: atelier-schemas',
    },
  },

  // 2. policies — depends on schemas.
  {
    packageName: '@atelier/policies',
    filterArg: '@atelier/policies',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [`import { BASELINE_POLICIES, validateManifest } from '@atelier/policies';`],
      sample: `if (!Array.isArray(BASELINE_POLICIES) || BASELINE_POLICIES.length === 0) {
  throw new Error('BASELINE_POLICIES is empty');
}
if (typeof validateManifest !== 'function') {
  throw new Error('validateManifest export missing');
}
console.log('smoke ok: policies, baseline count =', BASELINE_POLICIES.length);`,
    },
  },

  // 3. runtime — depends on schemas + policies.
  {
    packageName: '@atelier/runtime',
    filterArg: '@atelier/runtime',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/testing/index.js',
      'package/dist/testing/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { ActionDispatcher, MapActionRegistry, InMemoryTriggerBus } from '@atelier/runtime';`,
        `import type { ActionDispatcherOptions } from '@atelier/runtime';`,
      ],
      sample: `const _typeProbe: keyof ActionDispatcherOptions | undefined = undefined;
void _typeProbe;
if (typeof ActionDispatcher !== 'function') throw new Error('ActionDispatcher missing');
if (typeof MapActionRegistry !== 'function') throw new Error('MapActionRegistry missing');
const bus = new InMemoryTriggerBus();
if (typeof bus.subscribe !== 'function') throw new Error('TriggerBus shape wrong');
console.log('smoke ok: runtime');`,
    },
  },

  // 4. keyboard — pure logic, no deps.
  {
    packageName: '@atelier/keyboard',
    filterArg: '@atelier/keyboard',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { InMemoryKeyboardRegistry, parseHotkey } from '@atelier/keyboard';`,
        `import type { KeyboardAction } from '@atelier/keyboard';`,
      ],
      sample: `const registry = new InMemoryKeyboardRegistry();
const action: KeyboardAction = {
  id: 'demo.echo',
  label: 'Echo',
  hotkey: 'mod+e',
  invoke: () => undefined,
};
registry.register(action);
const parsed = parseHotkey('mod+e');
if (!parsed.steps[0]) throw new Error('parseHotkey did not produce a step');
console.log('smoke ok: keyboard');`,
    },
  },

  // 5. data-resolvers — depends on schemas only.
  {
    packageName: '@atelier/data-resolvers',
    filterArg: '@atelier/data-resolvers',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { MockDataResolver, withCache } from '@atelier/data-resolvers';`,
        `import type { DataBinding } from '@atelier/data-resolvers';`,
      ],
      sample: `const resolver = new MockDataResolver({
  fixtures: { 'demo.list': [{ id: 'a' }, { id: 'b' }] },
});
const _binding: DataBinding = { source: 'demo.list' };
if (typeof resolver.resolve !== 'function') throw new Error('resolver.resolve missing');
if (typeof withCache !== 'function') throw new Error('withCache missing');
void _binding;
console.log('smoke ok: data-resolvers');`,
    },
  },

  // 6. components — React peer dep; uses non-JSX exports (binding tables) so
  //    the consumer doesn't need a JSX-aware tsconfig. JSX peer types still
  //    referenced in the .d.ts, so React types must be installed.
  {
    packageName: '@atelier/components',
    filterArg: '@atelier/components',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/registry.js',
      'package/dist/composition-rules.js',
      'package/src/index.ts',
    ],
    needsReact: true,
    consumerCheck: {
      importLines: [
        `import { ALL_COMPONENTS, COMPONENT_BINDINGS, COMPOSITION_RULES, resolveDensity } from '@atelier/components';`,
        `import { DENSITY_AWARE_COMPONENTS } from '@atelier/components/_variants';`,
      ],
      sample: `if (typeof ALL_COMPONENTS.get !== 'function') throw new Error('ALL_COMPONENTS missing');
if (!COMPONENT_BINDINGS.Button) throw new Error('Button binding missing');
if (!COMPOSITION_RULES) throw new Error('COMPOSITION_RULES missing');
if (typeof resolveDensity !== 'function') throw new Error('resolveDensity missing');
if (!(DENSITY_AWARE_COMPONENTS instanceof Set)) throw new Error('_variants subpath broken');
console.log('smoke ok: components');`,
    },
  },

  // 7. react — depends on components + runtime + policies + schemas. JSX needed.
  {
    packageName: '@atelier/react',
    filterArg: '@atelier/react',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/testing/index.js',
      'package/dist/debug/index.js',
      'package/src/index.ts',
    ],
    needsReact: true,
    // `@atelier/react/testing` re-exports `@testing-library/react`. That's a
    // devDep of the package, so consumers wiring tests must install it
    // themselves — we replicate that here so the smoke import resolves.
    extraDeps: { '@testing-library/react': '^16.3.2' },
    consumerCheck: {
      importLines: [
        `import { CirRuntime, EmptyDataResolver, BASELINE_RESOLVER_DEFAULTS } from '@atelier/react';`,
        `import { buildTestServices } from '@atelier/react/testing';`,
        `import { CompileBadge } from '@atelier/react/debug';`,
      ],
      sample: `if (typeof CirRuntime !== 'function') throw new Error('CirRuntime missing');
if (typeof EmptyDataResolver !== 'object' && typeof EmptyDataResolver !== 'function') {
  throw new Error('EmptyDataResolver missing');
}
if (!BASELINE_RESOLVER_DEFAULTS) throw new Error('BASELINE_RESOLVER_DEFAULTS missing');
if (typeof buildTestServices !== 'function') throw new Error('react/testing broken');
if (typeof CompileBadge !== 'function') throw new Error('react/debug broken');
console.log('smoke ok: react');`,
    },
  },

  // 8. compiler — depends on schemas + policies (and pulls @google/genai etc).
  {
    packageName: '@atelier/compiler',
    filterArg: '@atelier/compiler',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { MemoryManifestStore, ServerManifestResolver } from '@atelier/compiler';`,
      ],
      sample: `const store = new MemoryManifestStore();
if (typeof store.get !== 'function') throw new Error('ManifestStore.get missing');
if (typeof ServerManifestResolver !== 'function') throw new Error('ServerManifestResolver missing');
console.log('smoke ok: compiler');`,
    },
  },

  // 9. capability-resolver — depends on compiler + schemas.
  {
    packageName: '@atelier/capability-resolver',
    filterArg: '@atelier/capability-resolver',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { SubstringCapabilityResolver, MemoryScopingCache } from '@atelier/capability-resolver';`,
      ],
      sample: `const resolver = new SubstringCapabilityResolver();
if (typeof resolver.scope !== 'function') throw new Error('SubstringCapabilityResolver.scope missing');
const cache = new MemoryScopingCache();
if (typeof cache.get !== 'function') throw new Error('MemoryScopingCache missing');
console.log('smoke ok: capability-resolver');`,
    },
  },

  // 10. recipe-resolver — depends on schemas.
  {
    packageName: '@atelier/recipe-resolver',
    filterArg: '@atelier/recipe-resolver',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { SubstringRecipeResolver, LocalRecipeStore } from '@atelier/recipe-resolver';`,
      ],
      sample: `const resolver = new SubstringRecipeResolver();
if (typeof resolver.resolve !== 'function') throw new Error('SubstringRecipeResolver.resolve missing');
if (typeof LocalRecipeStore !== 'function') throw new Error('LocalRecipeStore missing');
console.log('smoke ok: recipe-resolver');`,
    },
  },

  // 13. eval-marketplace — depends on policies, schemas, vault-server.
  {
    packageName: '@atelier/eval-marketplace',
    filterArg: '@atelier/eval-marketplace',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { runMarketplaceEval, DEFAULT_FIXTURES, REFERENCE_CAPABILITIES, REFERENCE_COMPONENTS } from '@atelier/eval-marketplace';`,
      ],
      sample: `if (typeof runMarketplaceEval !== 'function') throw new Error('runMarketplaceEval missing');
if (!DEFAULT_FIXTURES) throw new Error('DEFAULT_FIXTURES missing');
if (typeof REFERENCE_CAPABILITIES !== 'object') throw new Error('REFERENCE_CAPABILITIES missing');
if (typeof REFERENCE_COMPONENTS !== 'object') throw new Error('REFERENCE_COMPONENTS missing');
console.log('smoke ok: eval-marketplace');`,
    },
  },

  // 12. evals — depends on schemas. Has a published bin (atelier-evals).
  {
    packageName: '@atelier/evals',
    filterArg: '@atelier/evals',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/cli/index.js',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [`import { defineEval, ConsoleReporter, JsonReporter } from '@atelier/evals';`],
      sample: `if (typeof defineEval !== 'function') throw new Error('defineEval missing');
if (!ConsoleReporter || typeof ConsoleReporter.onResult !== 'function') {
  throw new Error('ConsoleReporter missing');
}
if (!JsonReporter || typeof JsonReporter.onResult !== 'function') {
  throw new Error('JsonReporter missing');
}
console.log('smoke ok: evals');`,
    },
    binCheck: {
      binName: 'atelier-evals',
      args: ['--help'],
      expectStdout: 'usage: atelier-evals',
      // `atelier-evals --help` is parsed as `--help` flag with empty command,
      // which the CLI rejects with usage-on-stderr + exit 1. Output still proves
      // the bin shebang resolves and the dist artefact loads cleanly.
      allowNonZero: true,
    },
  },

  // 13. vault-client — depends on schemas.
  {
    packageName: '@atelier/vault-client',
    filterArg: '@atelier/vault-client',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { VaultClient, MemoryTokenStorage, JwksCache } from '@atelier/vault-client';`,
      ],
      sample: `const storage = new MemoryTokenStorage();
if (typeof storage.read !== 'function') throw new Error('MemoryTokenStorage.read missing');
if (typeof VaultClient !== 'function') throw new Error('VaultClient missing');
if (typeof JwksCache !== 'function') throw new Error('JwksCache missing');
console.log('smoke ok: vault-client');`,
    },
  },

  // 14. vault-server — depends on schemas.
  {
    packageName: '@atelier/vault-server',
    filterArg: '@atelier/vault-server',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [
        `import { VaultService, MemoryVaultStorage, InMemoryMarketplaceStore } from '@atelier/vault-server';`,
      ],
      sample: `const storage = new MemoryVaultStorage();
if (typeof storage.getProfile !== 'function') throw new Error('MemoryVaultStorage.getProfile missing');
if (typeof VaultService !== 'function') throw new Error('VaultService missing');
if (typeof InMemoryMarketplaceStore !== 'function') throw new Error('InMemoryMarketplaceStore missing');
console.log('smoke ok: vault-server');`,
    },
  },

  // 15. cli — depends on compiler, components, schemas, vault-client, vault-server.
  //     Has the headline `atelier` bin.
  {
    packageName: '@atelier/cli',
    filterArg: '@atelier/cli',
    requiredEntries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/src/index.ts',
    ],
    consumerCheck: {
      importLines: [`import { main } from '@atelier/cli';`],
      sample: `if (typeof main !== 'function') throw new Error('cli main() export missing');
console.log('smoke ok: cli');`,
    },
    binCheck: {
      binName: 'atelier',
      args: ['--help'],
      expectStdout: 'usage: atelier <command>',
    },
  },
];
