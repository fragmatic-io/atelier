// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * `atelier init` standalone smoke test (Sprint 1.1).
 *
 *   1. Build the CLI + every package (the calling CI step does this).
 *   2. For each host (next15, vite):
 *        a. `atelier init <scratch>/my-app --host=<host> --no-install`
 *           and assert the canonical files exist.
 *        b. Verify `package.json` has @atelier/* deps as npm versions
 *           (NOT workspace:*).
 *        c. Pack every `@atelier/*` package via `pnpm pack` and rewrite
 *           the scaffolded `package.json` to point at the local tarballs
 *           with `file:` deps. This simulates the published-to-npm flow
 *           on a CI host that doesn't actually publish.
 *        d. `npm install --no-audit --no-fund` in the scaffold.
 *        e. `pnpm exec tsc --noEmit -p <scaffold>` against the installed
 *           packages — must exit 0.
 *        f. Print `du -sh node_modules` for the report.
 *
 * Usage:
 *   pnpm smoke-test:init
 *   tsx scripts/smoke-test-init.ts                   # equivalent
 *   tsx scripts/smoke-test-init.ts --keep            # leave scratch dir for inspection
 *   tsx scripts/smoke-test-init.ts --host next15     # only one host
 *   tsx scripts/smoke-test-init.ts --skip-install    # only the structure-only check
 */

/* eslint-disable no-console */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CLI_DIST = join(ROOT, 'packages', 'cli', 'dist', 'index.js');

type Host = 'next15' | 'vite';
const ALL_HOSTS: readonly Host[] = ['next15', 'vite'];

const KEEP = process.argv.includes('--keep');
const SKIP_INSTALL = process.argv.includes('--skip-install');
const HOST_ARG = (() => {
  const idx = process.argv.indexOf('--host');
  if (idx < 0) return undefined;
  const val = process.argv[idx + 1];
  if (val !== 'next15' && val !== 'vite') return undefined;
  return val;
})();

/**
 * Every `@atelier/*` package shipped from this monorepo. Order matters
 * for pack — none, but kept stable for log readability.
 */
const ATELIER_PACKAGES: readonly { name: string; dir: string }[] = [
  { name: '@atelier/schemas', dir: 'packages/schemas' },
  { name: '@atelier/policies', dir: 'packages/policies' },
  { name: '@atelier/runtime', dir: 'packages/runtime' },
  { name: '@atelier/components', dir: 'packages/components' },
  { name: '@atelier/react', dir: 'packages/react' },
  { name: '@atelier/compiler', dir: 'packages/compiler' },
  { name: '@atelier/capability-resolver', dir: 'packages/capability-resolver' },
  { name: '@atelier/recipe-resolver', dir: 'packages/recipe-resolver' },
  { name: '@atelier/data-resolvers', dir: 'packages/data-resolvers' },
  { name: '@atelier/keyboard', dir: 'packages/keyboard' },
  { name: '@atelier/vault-client', dir: 'packages/vault-client' },
  { name: '@atelier/vault-server', dir: 'packages/vault-server' },
  { name: '@atelier/cli', dir: 'packages/cli' },
  { name: '@atelier/evals', dir: 'packages/evals' },
  { name: '@atelier/eval-marketplace', dir: 'packages/eval-marketplace' },
];

function log(step: string, msg: string): void {
  console.log(`[smoke-test-init] ${step}: ${msg}`);
}

function fail(step: string, msg: string): never {
  console.error(`[smoke-test-init] FAIL ${step}: ${msg}`);
  process.exit(1);
}

/**
 * Pack a single package via `pnpm pack`. Returns the absolute tarball path.
 */
function packPackage(pkgDir: string, destDir: string, name: string): string {
  const before = readdirSync(destDir);
  execFileSync('pnpm', ['pack', '--pack-destination', destDir], {
    cwd: pkgDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const after = readdirSync(destDir);
  const newEntries = after.filter((f) => !before.includes(f) && f.endsWith('.tgz'));
  if (newEntries.length !== 1) {
    fail(
      'pack',
      `expected exactly one new .tgz from ${name}, got ${String(newEntries.length)}: ${newEntries.join(', ')}`,
    );
  }
  return join(destDir, newEntries[0]!);
}

function packAll(packDir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pkg of ATELIER_PACKAGES) {
    const tgz = packPackage(join(ROOT, pkg.dir), packDir, pkg.name);
    log('pack', `${pkg.name} -> ${tgz}`);
    out.set(pkg.name, tgz);
  }
  return out;
}

/**
 * Run `atelier init` against the dist entry and assert the canonical files
 * exist for `host`. Returns the absolute scaffold dir.
 */
function scaffold(parent: string, host: Host): string {
  const dirName = `app-${host}`;
  const result = spawnSync('node', [CLI_DIST, 'init', dirName, `--host=${host}`, '--no-install'], {
    cwd: parent,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    fail(
      'scaffold',
      `init ${host} failed (exit ${String(result.status)})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  log('scaffold', `init ${host} succeeded`);
  return join(parent, dirName);
}

const REQUIRED_FILES_NEXT15 = [
  'package.json',
  'tsconfig.json',
  'next.config.mjs',
  'README.md',
  '.env.local.example',
  '.gitignore',
  'brand-kit.json',
  'app/page.tsx',
  'app/layout.tsx',
  'app/api/cir/manifest/[...slug]/route.ts',
  'app/api/triggers/publish/route.ts',
  'lib/atelier-server.ts',
  'recipes/starter.json',
  'policies/destructive-confirmation.json',
  'capabilities/items.list.json',
  'capabilities/items.create.json',
  'skills/starter-empty-state.skill.md',
];

const REQUIRED_FILES_VITE = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'README.md',
  '.env.local.example',
  '.gitignore',
  'brand-kit.json',
  'src/main.tsx',
  'src/app.tsx',
  'src/atelier-server.ts',
  'recipes/starter.json',
  'policies/destructive-confirmation.json',
  'capabilities/items.list.json',
  'capabilities/items.create.json',
  'skills/starter-empty-state.skill.md',
];

function assertFiles(scaffoldDir: string, host: Host): void {
  const required = host === 'next15' ? REQUIRED_FILES_NEXT15 : REQUIRED_FILES_VITE;
  for (const rel of required) {
    if (!existsSync(join(scaffoldDir, rel))) {
      fail('files', `missing ${rel} after scaffold ${host}`);
    }
  }
  log('files', `${host}: all ${String(required.length)} required files present`);
}

function assertNpmDeps(scaffoldDir: string, host: Host): void {
  const raw = readFileSync(join(scaffoldDir, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw) as {
    dependencies: Record<string, string>;
  };
  const required = [
    '@atelier/runtime',
    '@atelier/react',
    '@atelier/components',
    '@atelier/compiler',
  ];
  for (const dep of required) {
    const v = pkg.dependencies[dep];
    if (!v) fail('deps', `${host}: ${dep} missing from dependencies`);
    if (v.startsWith('workspace:')) {
      fail('deps', `${host}: ${dep} is "workspace:" — must be an npm version`);
    }
    if (!/^[\^~]?\d/.test(v)) {
      fail('deps', `${host}: ${dep} version "${v}" is not an npm semver`);
    }
  }
  log('deps', `${host}: all required @atelier/* deps are npm-style`);
}

/**
 * Rewrite the scaffolded `package.json` so each `@atelier/*` dep becomes
 * a `file:<tgz>` reference AND every transitive `@atelier/*` resolution
 * is overridden via `pnpm.overrides` — without overrides, the local
 * tarballs would still try to fetch their own deps from npm (which
 * doesn't host `@atelier/*` yet).
 *
 * This is the key bridge — the scaffold ships with `^0.1.0` (npm-style),
 * but CI has no public registry to pull from, so we substitute local
 * tarballs at install time AND make pnpm honour them transitively.
 */
function rewriteToLocalTarballs(scaffoldDir: string, tarballs: Map<string, string>): void {
  const pkgPath = join(scaffoldDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
    pnpm?: { overrides?: Record<string, string> };
  };
  for (const [name, tgz] of tarballs) {
    if (pkg.dependencies[name] !== undefined) {
      pkg.dependencies[name] = `file:${tgz}`;
    }
    if (pkg.devDependencies?.[name] !== undefined) {
      pkg.devDependencies[name] = `file:${tgz}`;
    }
  }
  // pnpm.overrides forces transitive @atelier/* resolutions through the
  // local tarballs as well. Without this, `@atelier/compiler` (one of our
  // tarballs) tries to fetch its `@atelier/schemas` dep from npm.
  pkg.pnpm = pkg.pnpm ?? {};
  pkg.pnpm.overrides = pkg.pnpm.overrides ?? {};
  for (const [name, tgz] of tarballs) {
    pkg.pnpm.overrides[name] = `file:${tgz}`;
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * `pnpm install` against the scaffold. Returns true on success. We use
 * pnpm (not npm) here because pnpm honours the `pnpm.overrides` block we
 * write above; npm has its own `overrides` field but its semantics for
 * `file:` deps are flakier.
 */
function packageInstall(scaffoldDir: string): boolean {
  log('install', `pnpm install --ignore-workspace (cwd=${scaffoldDir})`);
  const result = spawnSync(
    'pnpm',
    ['install', '--ignore-workspace', '--no-frozen-lockfile', '--config.confirmModulesPurge=false'],
    {
      cwd: scaffoldDir,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
  if (result.status !== 0) {
    fail(
      'install',
      `pnpm install failed (exit ${String(result.status)})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  log('install', 'pnpm install succeeded');
  return true;
}

function typecheck(scaffoldDir: string): void {
  log('typecheck', `pnpm exec tsc --noEmit -p ${scaffoldDir}`);
  const result = spawnSync(
    'pnpm',
    ['exec', 'tsc', '--noEmit', '-p', join(scaffoldDir, 'tsconfig.json')],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
  if (result.status !== 0) {
    fail(
      'typecheck',
      `tsc failed (exit ${String(result.status)})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  log('typecheck', 'tsc --noEmit clean');
}

function nodeModulesSize(scaffoldDir: string): string {
  const result = spawnSync('du', ['-sh', join(scaffoldDir, 'node_modules')], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) return '?';
  return result.stdout.trim().split(/\s+/)[0] ?? '?';
}

function main(): void {
  if (!existsSync(CLI_DIST)) {
    fail('precheck', `CLI dist not found: ${CLI_DIST} — run \`pnpm build\` first`);
  }

  const scratch = mkdtempSync(join(tmpdir(), 'atelier-init-smoke-'));
  log('scratch', scratch);

  const packDir = join(scratch, 'pack');
  mkdirSync(packDir, { recursive: true });
  const scaffolds: { host: Host; dir: string; nodeModules: string }[] = [];

  try {
    const tarballs = SKIP_INSTALL ? new Map<string, string>() : packAll(packDir);

    const targets: readonly Host[] = HOST_ARG ? [HOST_ARG] : ALL_HOSTS;
    for (const host of targets) {
      const scaffoldDir = scaffold(scratch, host);
      assertFiles(scaffoldDir, host);
      assertNpmDeps(scaffoldDir, host);

      if (!SKIP_INSTALL) {
        rewriteToLocalTarballs(scaffoldDir, tarballs);
        packageInstall(scaffoldDir);
        typecheck(scaffoldDir);
        const size = nodeModulesSize(scaffoldDir);
        log('size', `${host}: node_modules = ${size}`);
        scaffolds.push({ host, dir: scaffoldDir, nodeModules: size });
      }
    }

    console.log('');
    console.log('[smoke-test-init] ok — scaffolds verified');
    if (scaffolds.length > 0) {
      console.log('');
      console.log('  Host    node_modules size');
      console.log('  ------  -----------------');
      for (const s of scaffolds) {
        console.log(`  ${s.host.padEnd(6)}  ${s.nodeModules}`);
      }
    }
  } finally {
    if (KEEP) {
      console.log(`[smoke-test-init] kept scratch dir: ${scratch}`);
    } else {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

main();
