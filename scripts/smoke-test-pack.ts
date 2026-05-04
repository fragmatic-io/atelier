// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * Package smoke test — pack `@atelier/schemas`, install into a scratch
 * directory, and verify an external consumer can import + typecheck against
 * the published artifact without `tsx` / `ts-node`. Then run bare-Node smokes
 * against the migrated workspace dist artifacts (`runtime`, `policies`,
 * `compiler`, `cli`).
 *
 * The flow exactly mirrors what someone running `npm install @atelier/schemas`
 * out in the wild would do:
 *
 *   1. `pnpm pack` the schemas package -> `atelier-schemas-<version>.tgz`.
 *   2. Create a scratch directory with a minimal `package.json` + `tsconfig.json`.
 *      The scratch package has only `npm` available (no pnpm workspace, no tsx).
 *   3. Install the tgz with `npm install <path-to-tgz>`. This is the consumer
 *      moment — if our `exports` / `files` are wrong, it shows up here.
 *   4. Inspect the tgz and confirm `dist/` and `src/` are inside.
 *   5. Write tiny TS + JS consumers that import + use `CapabilitySchema`.
 *      Typecheck the TS against the published .d.ts, then run JS with Node.
 *   6. Execute the installed `atelier-schemas` bin with `--help`, then run a
 *      small `dump` command to prove the published CLI works without tsx.
 *   7. Import core package exports from the built workspace and execute the
 *      `atelier` CLI dist entry with bare Node.
 *
 * Usage:
 *   pnpm smoke-test:pack
 *   tsx scripts/smoke-test-pack.ts                   # equivalent
 *   tsx scripts/smoke-test-pack.ts --keep            # leave scratch dir for inspection
 *
 * Wired into CI as a step that runs after `pnpm build` and gates the merge.
 */

/* eslint-disable no-console */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGE_DIR = join(ROOT, 'packages', 'schemas');

const KEEP = process.argv.includes('--keep');

function log(step: string, msg: string): void {
  console.log(`[smoke-test-pack] ${step}: ${msg}`);
}

function fail(step: string, msg: string): never {
  console.error(`[smoke-test-pack] FAIL ${step}: ${msg}`);
  process.exit(1);
}

/**
 * Pack the schemas package. Pack into a fresh tmp directory so we don't leak
 * tarballs into the repo or `/tmp`.
 */
function packSchemas(destDir: string): string {
  log('pack', `pnpm pack --pack-destination ${destDir}`);
  const out = execFileSync('pnpm', ['pack', '--pack-destination', destDir], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
  });
  // pnpm pack prints the tarball path on the last non-empty line.
  const lines = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) fail('pack', `pnpm pack produced no output:\n${out}`);
  // Walk the destDir for the produced .tgz (more robust than parsing stdout).
  const entries = readdirSync(destDir).filter((f) => f.endsWith('.tgz'));
  if (entries.length === 0) fail('pack', `no .tgz produced in ${destDir}`);
  if (entries.length > 1) fail('pack', `multiple .tgz produced: ${entries.join(', ')}`);
  return join(destDir, entries[0]!);
}

/**
 * Inspect tarball contents — must contain dist/index.js, dist/index.d.ts,
 * src/index.ts, package.json, README.md.
 */
function inspectTarball(tgzPath: string): void {
  log('inspect', `tar -tzf ${tgzPath}`);
  const out = execFileSync('tar', ['-tzf', tgzPath], { encoding: 'utf8' });
  const entries = out.split('\n').filter(Boolean);

  const required = [
    'package/package.json',
    'package/dist/index.js',
    'package/dist/index.d.ts',
    'package/dist/cli/index.js',
    'package/src/index.ts',
    'package/README.md',
  ];
  for (const r of required) {
    if (!entries.some((e) => e === r)) {
      fail('inspect', `tarball is missing required entry: ${r}\nentries:\n${entries.join('\n')}`);
    }
  }
  log('inspect', `tarball contains ${entries.length} entries; all required entries present`);
}

/**
 * Bootstrap a minimal external-consumer project, install the tgz, write tiny
 * consumers that use both runtime + types, then run typecheck/runtime/bin
 * checks against the installed package.
 *
 * We use npm (not pnpm) here because external consumers are most often on
 * npm and we want to verify the package works on the lowest-common-denominator
 * registry client.
 */
function consumeAndTypecheck(tgzPath: string, scratchDir: string): void {
  // package.json — minimal ESM consumer.
  const consumerPkg = {
    name: 'atelier-schemas-smoke-consumer',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: {
      // Filled in by `npm install file:<tgz>` below.
    },
  };
  writeFileSync(join(scratchDir, 'package.json'), JSON.stringify(consumerPkg, null, 2));

  // tsconfig — strict, modern, mirrors what a downstream Next.js / Vite app
  // would use. Bundler resolution because that's the realistic case (Next 15,
  // Vite 5, Astro 4 all use it).
  const consumerTsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      verbatimModuleSyntax: true,
    },
    include: ['consumer.ts'],
  };
  writeFileSync(join(scratchDir, 'tsconfig.json'), JSON.stringify(consumerTsconfig, null, 2));

  const capabilitySample = `{
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

  // Tiny TS consumer. Must touch both a runtime export AND a type export to
  // exercise both the .js and .d.ts halves of the contract.
  const consumerSource = `// Smoke consumer - exercises both runtime + type exports.
import { CapabilitySchema, type Capability } from '@atelier/schemas';

const cap: Capability = CapabilitySchema.parse(${capabilitySample});

if (typeof cap.id !== 'string') throw new Error('expected cap.id string');
console.log('smoke-consumer ok:', cap.id);
`;
  writeFileSync(join(scratchDir, 'consumer.ts'), consumerSource);

  const runtimeSource = `// Smoke runtime consumer - must run in bare Node.
import { CapabilitySchema } from '@atelier/schemas';

const cap = CapabilitySchema.parse(${capabilitySample});
console.log('smoke-runtime ok:', cap.id);
`;
  writeFileSync(join(scratchDir, 'consumer.mjs'), runtimeSource);

  // npm install the tgz. This is the moment of truth.
  log('install', `npm install file:${tgzPath}`);
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', `file:${tgzPath}`], {
    cwd: scratchDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (install.status !== 0) {
    fail(
      'install',
      `npm install failed (exit ${install.status})\nstdout:\n${install.stdout}\nstderr:\n${install.stderr}`,
    );
  }
  log('install', 'npm install succeeded');

  // Confirm node_modules layout is what we'd expect.
  const installedPkgPath = join(scratchDir, 'node_modules', '@atelier', 'schemas', 'package.json');
  const installedPkg = JSON.parse(readFileSync(installedPkgPath, 'utf8')) as {
    bin?: Record<string, string>;
    main?: string;
    types?: string;
  };
  if (installedPkg.main !== './dist/index.js') {
    fail('install', `installed package.main is ${installedPkg.main!}, expected ./dist/index.js`);
  }
  if (installedPkg.types !== './dist/index.d.ts') {
    fail(
      'install',
      `installed package.types is ${installedPkg.types!}, expected ./dist/index.d.ts`,
    );
  }
  if (installedPkg.bin?.['atelier-schemas'] !== './dist/cli/index.js') {
    fail(
      'install',
      `installed package bin is ${installedPkg.bin?.['atelier-schemas']}, expected ./dist/cli/index.js`,
    );
  }

  // Run tsc --noEmit. Use the consumer's own tsc — but the scratch dir has none.
  // Easier: invoke the repo's TypeScript via `pnpm exec tsc` with the scratch
  // tsconfig. That's still a valid external-consumer simulation because we're
  // exercising the published .d.ts; tsc itself is the same binary either way.
  log('typecheck', `tsc --noEmit -p ${scratchDir}/tsconfig.json`);
  const tsc = spawnSync(
    'pnpm',
    ['exec', 'tsc', '--noEmit', '-p', join(scratchDir, 'tsconfig.json')],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
  if (tsc.status !== 0) {
    fail(
      'typecheck',
      `tsc reported errors against the published .d.ts (exit ${tsc.status})\nstdout:\n${tsc.stdout}\nstderr:\n${tsc.stderr}`,
    );
  }
  log('typecheck', 'tsc --noEmit clean against published types');

  // Prove the runtime consumer runs under bare Node.
  log('runtime', 'node consumer.mjs');
  const runtime = spawnSync('node', ['consumer.mjs'], {
    cwd: scratchDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (runtime.status !== 0) {
    fail(
      'runtime',
      `node consumer failed (exit ${runtime.status})\nstdout:\n${runtime.stdout}\nstderr:\n${runtime.stderr}`,
    );
  }
  if (!runtime.stdout.includes('smoke-runtime ok: demo.example_archive')) {
    fail('runtime', `unexpected runtime output:\n${runtime.stdout}\nstderr:\n${runtime.stderr}`);
  }
  log('runtime', 'bare-node consumer succeeded');

  const binPath = join(scratchDir, 'node_modules', '.bin', 'atelier-schemas');

  log('bin', 'atelier-schemas --help');
  const help = spawnSync(binPath, ['--help'], {
    cwd: scratchDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (help.status !== 0) {
    fail(
      'bin',
      `--help failed (exit ${help.status})\nstdout:\n${help.stdout}\nstderr:\n${help.stderr}`,
    );
  }
  if (!help.stdout.includes('usage: atelier-schemas')) {
    fail('bin', `--help did not print usage\nstdout:\n${help.stdout}\nstderr:\n${help.stderr}`);
  }
  log('bin', '--help succeeded');

  const dumpDir = join(scratchDir, 'dumped-schemas');
  log('dump', `atelier-schemas dump --out ${dumpDir}`);
  const dump = spawnSync(binPath, ['dump', '--out', dumpDir], {
    cwd: scratchDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (dump.status !== 0) {
    fail(
      'dump',
      `dump failed (exit ${dump.status})\nstdout:\n${dump.stdout}\nstderr:\n${dump.stderr}`,
    );
  }
  const dumpedCapability = join(dumpDir, 'capability.json');
  const dumpedRaw = readFileSync(dumpedCapability, 'utf8');
  const dumpedSchema = JSON.parse(dumpedRaw) as {
    $id?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  if (
    dumpedSchema.$id !== 'https://cir.dev/schemas/capability.json' ||
    !dumpedSchema.properties?.['kind'] ||
    !dumpedSchema.required?.includes('confirmation')
  ) {
    fail('dump', `capability schema was not dumped as expected:\n${dumpedRaw.slice(0, 500)}`);
  }
  log('dump', 'dump command wrote capability.json');
}

function runWorkspaceArtifactSmoke(): void {
  log('workspace-runtime', 'node --input-type=module core import smoke');
  const runtime = spawnSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `
import { ActionDispatcher, MapActionRegistry } from '@atelier/runtime';
import { validateManifest } from '@atelier/policies';
import { MemoryManifestStore, ServerManifestResolver } from '@atelier/compiler';

if (typeof ActionDispatcher !== 'function') throw new Error('ActionDispatcher export missing');
if (typeof MapActionRegistry !== 'function') throw new Error('MapActionRegistry export missing');
if (typeof validateManifest !== 'function') throw new Error('validateManifest export missing');
if (typeof MemoryManifestStore !== 'function') throw new Error('MemoryManifestStore export missing');
if (typeof ServerManifestResolver !== 'function') throw new Error('ServerManifestResolver export missing');
console.log('workspace-runtime ok');
`,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
  if (runtime.status !== 0) {
    fail(
      'workspace-runtime',
      `core import smoke failed (exit ${runtime.status})\nstdout:\n${runtime.stdout}\nstderr:\n${runtime.stderr}`,
    );
  }
  if (!runtime.stdout.includes('workspace-runtime ok')) {
    fail('workspace-runtime', `unexpected output:\n${runtime.stdout}\nstderr:\n${runtime.stderr}`);
  }
  log('workspace-runtime', 'core dist imports succeeded');

  log('cli-bin', 'node packages/cli/dist/index.js --help');
  const cliHelp = spawnSync('node', [join(ROOT, 'packages', 'cli', 'dist', 'index.js'), '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (cliHelp.status !== 0) {
    fail(
      'cli-bin',
      `atelier --help failed (exit ${cliHelp.status})\nstdout:\n${cliHelp.stdout}\nstderr:\n${cliHelp.stderr}`,
    );
  }
  if (!cliHelp.stdout.includes('usage: atelier <command>')) {
    fail('cli-bin', `atelier --help did not print top-level usage\nstdout:\n${cliHelp.stdout}`);
  }
  log('cli-bin', 'atelier dist entrypoint succeeded under bare Node');
}

function main(): void {
  // Scratch directory for the whole smoke test.
  const scratchDir = mkdtempSync(join(tmpdir(), 'atelier-schemas-smoke-'));
  log('scratch', scratchDir);

  try {
    const packDir = join(scratchDir, 'pack');
    mkdirSync(packDir, { recursive: true });
    const consumerDir = join(scratchDir, 'consumer');
    mkdirSync(consumerDir, { recursive: true });

    const tgzPath = packSchemas(packDir);
    log('pack', `produced ${tgzPath}`);

    inspectTarball(tgzPath);
    consumeAndTypecheck(tgzPath, consumerDir);
    runWorkspaceArtifactSmoke();

    console.log('[smoke-test-pack] ok — package artifacts are consumable');
  } finally {
    if (KEEP) {
      console.log(`[smoke-test-pack] kept scratch dir: ${scratchDir}`);
    } else {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }
}

main();
