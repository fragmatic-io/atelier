// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * Pack smoke test — packs every published `@atelier/*` workspace package,
 * installs all 15 tarballs into a SHARED scratch dir (so cross-package deps
 * like `@atelier/react` → `@atelier/runtime` resolve through the published
 * artifacts, not workspace symlinks), and verifies an external consumer can
 *
 *   - `npm install` each tarball
 *   - `import` the documented exports
 *   - `tsc --noEmit` against the published `.d.ts`
 *   - run the built JS under bare Node
 *   - exec the bin (when the package publishes one)
 *
 * The flow exactly mirrors what someone running `npm install @atelier/...`
 * out in the wild would do. Specs live in `scripts/smoke-test-specs.ts`.
 *
 * Usage:
 *   pnpm smoke-test:pack                                # all 15 packages, sequential
 *   pnpm smoke-test:pack --parallel                     # pack + checks in parallel
 *   pnpm smoke-test:pack --package=@atelier/runtime     # smoke just one
 *   pnpm smoke-test:pack --keep                         # leave scratch dir for debugging
 *
 * Wired into CI as the `Smoke-test pack — all 15 packages` step. Gates merge.
 */

/* eslint-disable no-console */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { SMOKE_SPECS, type SmokeSpec } from './smoke-test-specs.js';

const ROOT = resolve(import.meta.dirname, '..');

// -----------------------------------------------------------------------------
// CLI flag parsing — minimal, hand-rolled.
// -----------------------------------------------------------------------------

interface ParsedFlags {
  keep: boolean;
  parallel: boolean;
  packageFilter: string | null;
}

function parseFlags(argv: readonly string[]): ParsedFlags {
  let keep = false;
  let parallel = false;
  let packageFilter: string | null = null;
  for (const arg of argv) {
    if (arg === '--keep') keep = true;
    else if (arg === '--parallel') parallel = true;
    else if (arg.startsWith('--package=')) packageFilter = arg.slice('--package='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: tsx scripts/smoke-test-pack.ts [flags]',
          '',
          '  --keep                Leave the scratch dir for inspection',
          '  --parallel            Pack + per-spec checks in parallel (faster)',
          '  --package=<name>      Smoke just one spec (full @atelier/<name>)',
          '  --help                This message',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      console.error(`[smoke-test-pack] unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  return { keep, parallel, packageFilter };
}

const FLAGS = parseFlags(process.argv.slice(2));

// -----------------------------------------------------------------------------
// Logging helpers.
// -----------------------------------------------------------------------------

function log(scope: string, msg: string): void {
  console.log(`[smoke-test-pack] ${scope}: ${msg}`);
}

function logFail(scope: string, msg: string): void {
  console.error(`[smoke-test-pack] FAIL ${scope}: ${msg}`);
}

// -----------------------------------------------------------------------------
// Per-spec result.
// -----------------------------------------------------------------------------

type Phase = 'pack' | 'inspect' | 'install' | 'typecheck' | 'runtime' | 'bin';

interface SpecResult {
  packageName: string;
  ok: boolean;
  phase: Phase | null;
  durationMs: number;
  error?: string;
}

// -----------------------------------------------------------------------------
// Phase: pack a single package into a destination directory.
// -----------------------------------------------------------------------------

function sanitizeName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '_');
}

function packPackage(spec: SmokeSpec, packDir: string): string {
  const specPackDir = join(packDir, sanitizeName(spec.packageName));
  mkdirSync(specPackDir, { recursive: true });
  execFileSync('pnpm', ['--filter', spec.filterArg, 'pack', '--pack-destination', specPackDir], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const tgzs = readdirSync(specPackDir).filter((f) => f.endsWith('.tgz'));
  if (tgzs.length === 0) {
    throw new Error(`pnpm pack produced no .tgz in ${specPackDir}`);
  }
  if (tgzs.length > 1) {
    throw new Error(`pnpm pack produced multiple .tgz in ${specPackDir}: ${tgzs.join(', ')}`);
  }
  return join(specPackDir, tgzs[0]!);
}

// -----------------------------------------------------------------------------
// Phase: inspect the tarball for the package's required entries.
// -----------------------------------------------------------------------------

function inspectTarball(spec: SmokeSpec, tgzPath: string): void {
  const out = execFileSync('tar', ['-tzf', tgzPath], { encoding: 'utf8' });
  const entries = new Set(out.split('\n').filter(Boolean));
  for (const required of spec.requiredEntries) {
    if (!entries.has(required)) {
      throw new Error(
        `tarball ${tgzPath} missing required entry: ${required} (${entries.size} entries total)`,
      );
    }
  }
}

// -----------------------------------------------------------------------------
// Phase: bootstrap the SHARED scratch consumer dir (one node_modules tree,
// one tsconfig.json, one package.json — all 15 tarballs install here so
// cross-package imports resolve through the published artifacts).
// -----------------------------------------------------------------------------

function bootstrapConsumer(consumerDir: string, specs: readonly SmokeSpec[]): void {
  const needsReact = specs.some((s) => s.needsReact);
  const extraDeps: Record<string, string> = {};
  for (const s of specs) {
    if (s.extraDeps) Object.assign(extraDeps, s.extraDeps);
  }
  const dependencies: Record<string, string> = { ...extraDeps };
  const devDependencies: Record<string, string> = {};
  if (needsReact) {
    dependencies['react'] = '^19.0.0';
    dependencies['react-dom'] = '^19.0.0';
    devDependencies['@types/react'] = '^19.0.0';
    devDependencies['@types/react-dom'] = '^19.0.0';
  }
  const consumerPkg: Record<string, unknown> = {
    name: 'atelier-pack-smoke-consumer',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies,
  };
  if (Object.keys(devDependencies).length > 0) {
    consumerPkg['devDependencies'] = devDependencies;
  }
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify(consumerPkg, null, 2));

  const tsconfig: Record<string, unknown> = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      verbatimModuleSyntax: true,
      ...(needsReact ? { jsx: 'react-jsx' } : {}),
    },
    include: ['consumer-*.ts'],
  };
  writeFileSync(join(consumerDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  // Initial install — pulls react/react-dom + any extra deps before tarballs.
  if (needsReact || Object.keys(extraDeps).length > 0) {
    const init = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
      cwd: consumerDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (init.status !== 0) {
      throw new Error(
        `npm install (initial deps) failed (exit ${init.status})\nstdout:\n${init.stdout}\nstderr:\n${init.stderr}`,
      );
    }
  }
}

// -----------------------------------------------------------------------------
// Phase: write per-spec consumer .ts and .mjs files.
// -----------------------------------------------------------------------------

function writeConsumerFiles(spec: SmokeSpec, consumerDir: string): { ts: string; mjs: string } {
  const safe = sanitizeName(spec.packageName);
  const importBlock = spec.consumerCheck.importLines.join('\n');
  const tsName = `consumer-${safe}.ts`;
  const tsBody = `// Smoke consumer for ${spec.packageName} — exercises the published surface.
${importBlock}

${spec.consumerCheck.sample}
`;
  writeFileSync(join(consumerDir, tsName), tsBody);

  // Runtime consumer: strip type-only imports and TS annotations so the body
  // runs under bare Node ESM.
  const mjsImports = spec.consumerCheck.importLines
    .map((line) => stripTypeOnlyImport(line))
    .filter((line): line is string => Boolean(line))
    .join('\n');
  const mjsName = `consumer-${safe}.mjs`;
  const mjsBody = `// Smoke runtime consumer for ${spec.packageName} — bare Node.
${mjsImports}

${stripTsAnnotations(spec.consumerCheck.sample)}
`;
  writeFileSync(join(consumerDir, mjsName), mjsBody);
  return { ts: tsName, mjs: mjsName };
}

/**
 * Drop `import type { ... }` lines (return null), and remove `type X` tokens
 * from named-import lists, leaving value imports intact.
 */
function stripTypeOnlyImport(line: string): string | null {
  if (/^\s*import\s+type\b/.test(line)) return null;
  const out = line.replace(/\{([^}]*)\}/, (_match, inner: string) => {
    const cleaned = inner
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^type\s/.test(s))
      .join(', ');
    return cleaned.length > 0 ? `{ ${cleaned} }` : '{}';
  });
  if (/import\s+\{\s*\}\s+from/.test(out)) return null;
  return out;
}

/**
 * Pragmatic regex pass to strip TS-only annotations from spec-sample bodies.
 * Specs deliberately stick to patterns this can handle:
 *
 *   - `const X: Type = ...`            → `const X = ...`
 *   - `const X: Type | null = ...`     → `const X = ...`
 *
 * Function-signature types and generics with commas are intentionally avoided
 * in the sample bodies; if a future spec needs those, run the body through a
 * real stripper (e.g. `tsx` writing a separate `.cjs` artefact).
 */
function stripTsAnnotations(source: string): string {
  return source.replace(
    /\b(const|let|var)\s+(\w+)\s*:\s*[^=\n]+?=\s*/g,
    (_m, kw: string, name: string) => `${kw} ${name} = `,
  );
}

// -----------------------------------------------------------------------------
// Phase: install one tarball into the shared consumer.
// -----------------------------------------------------------------------------

function installAllTarballs(tgzPaths: readonly string[], consumerDir: string): void {
  if (tgzPaths.length === 0) return;
  const args = ['install', '--no-audit', '--no-fund', ...tgzPaths.map((p) => `file:${p}`)];
  const result = spawnSync('npm', args, {
    cwd: consumerDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(
      `npm install (${tgzPaths.length} tarballs) failed (exit ${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

// -----------------------------------------------------------------------------
// Phase: typecheck the shared consumer.
// -----------------------------------------------------------------------------

function typecheckConsumer(consumerDir: string): void {
  const tsc = spawnSync(
    'pnpm',
    ['exec', 'tsc', '--noEmit', '-p', join(consumerDir, 'tsconfig.json')],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
  if (tsc.status !== 0) {
    throw new Error(
      `tsc reported errors (exit ${tsc.status})\nstdout:\n${tsc.stdout}\nstderr:\n${tsc.stderr}`,
    );
  }
}

// -----------------------------------------------------------------------------
// Phase: per-spec runtime + bin.
// -----------------------------------------------------------------------------

function runtimeCheck(consumerDir: string, mjsName: string): void {
  const result = spawnSync('node', [mjsName], {
    cwd: consumerDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(
      `node ${mjsName} failed (exit ${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  if (!result.stdout.includes('smoke ok:')) {
    throw new Error(
      `runtime did not print 'smoke ok:'\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function binCheck(spec: SmokeSpec, consumerDir: string): void {
  if (!spec.binCheck) return;
  const binPath = join(consumerDir, 'node_modules', '.bin', spec.binCheck.binName);
  const result = spawnSync(binPath, [...spec.binCheck.args], {
    cwd: consumerDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  // Allow non-zero exit when the bin specifically declared `allowNonZero` —
  // some help paths (e.g. `atelier-evals --help` printing usage on the no-op
  // command) intentionally exit non-zero. The substring check still has to
  // pass against the combined stdout+stderr in that case.
  const haystack = `${result.stdout}\n${result.stderr}`;
  if (!spec.binCheck.allowNonZero && result.status !== 0) {
    throw new Error(
      `bin ${spec.binCheck.binName} ${spec.binCheck.args.join(' ')} failed (exit ${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  if (!haystack.includes(spec.binCheck.expectStdout)) {
    throw new Error(
      `bin ${spec.binCheck.binName} output did not contain expected substring "${spec.binCheck.expectStdout}"\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

// -----------------------------------------------------------------------------
// Pipeline state.
//
// Each spec progresses pack → inspect → install → typecheck → runtime → bin.
// We keep a single `Map<packageName, SpecResult>` and stamp it with the first
// failing phase so the summary reports precise per-package state.
// -----------------------------------------------------------------------------

interface PackedSpec {
  spec: SmokeSpec;
  tgzPath: string;
  /** Empty strings when this spec is pack-only (filtered out of checks). */
  consumerFiles: { ts: string; mjs: string };
}

// -----------------------------------------------------------------------------
// Main flow.
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();

  // Always pack + install ALL specs so cross-package deps resolve. `specs`
  // governs WHICH package gets a consumer file written + its checks run.
  // Dependency packages still get installed (so `import { CirRuntime }` from
  // `@atelier/react` finds `@atelier/runtime` etc.).
  const allSpecs: readonly SmokeSpec[] = SMOKE_SPECS;
  let checkedSpecs: readonly SmokeSpec[] = SMOKE_SPECS;
  if (FLAGS.packageFilter) {
    checkedSpecs = SMOKE_SPECS.filter((s) => s.packageName === FLAGS.packageFilter);
    if (checkedSpecs.length === 0) {
      const known = SMOKE_SPECS.map((s) => s.packageName).join(', ');
      console.error(
        `[smoke-test-pack] --package=${FLAGS.packageFilter} matched no spec. Known: ${known}`,
      );
      process.exit(2);
    }
  }
  const checkedNames = new Set(checkedSpecs.map((s) => s.packageName));

  log(
    'config',
    `${allSpecs.length} pack(s), ${checkedSpecs.length} checked | parallel=${FLAGS.parallel} | keep=${FLAGS.keep}${
      FLAGS.packageFilter ? ` | filter=${FLAGS.packageFilter}` : ''
    }`,
  );

  const scratchDir = mkdtempSync(join(tmpdir(), 'atelier-pack-smoke-'));
  log('scratch', scratchDir);

  const packDir = join(scratchDir, 'pack');
  const consumerDir = join(scratchDir, 'consumer');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  // Per-spec result table. Stamped on the first failing phase.
  const results = new Map<string, SpecResult>();
  const startTimes = new Map<string, number>();
  for (const s of allSpecs) {
    startTimes.set(s.packageName, Date.now());
  }

  function fail(spec: SmokeSpec, phase: Phase, error: string): void {
    if (results.has(spec.packageName)) return;
    results.set(spec.packageName, {
      packageName: spec.packageName,
      ok: false,
      phase,
      durationMs: Date.now() - (startTimes.get(spec.packageName) ?? Date.now()),
      error,
    });
  }

  function pass(spec: SmokeSpec): void {
    if (results.has(spec.packageName)) return;
    results.set(spec.packageName, {
      packageName: spec.packageName,
      ok: true,
      phase: null,
      durationMs: Date.now() - (startTimes.get(spec.packageName) ?? Date.now()),
    });
  }

  try {
    // Phase A: pack + inspect for ALL specs. Consumer files are only written
    // for `checkedSpecs` so the typecheck / runtime / bin phases stay scoped
    // when --package filter is set.
    log('phase', `pack + inspect (${FLAGS.parallel ? 'parallel' : 'sequential'})`);
    const packed: PackedSpec[] = [];
    // eslint-disable-next-line @typescript-eslint/require-await
    const packAndOptionallyWrite = async (s: SmokeSpec): Promise<PackedSpec> => {
      const tgzPath = packPackage(s, packDir);
      inspectTarball(s, tgzPath);
      const consumerFiles = checkedNames.has(s.packageName)
        ? writeConsumerFiles(s, consumerDir)
        : { ts: '', mjs: '' };
      return { spec: s, tgzPath, consumerFiles };
    };
    if (FLAGS.parallel) {
      const settled = await Promise.allSettled(allSpecs.map((s) => packAndOptionallyWrite(s)));
      for (let i = 0; i < settled.length; i += 1) {
        const r = settled[i]!;
        const s = allSpecs[i]!;
        if (r.status === 'fulfilled') {
          packed.push(r.value);
        } else {
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          logFail(s.packageName, `pack/inspect: ${msg}`);
          fail(s, 'pack', msg);
        }
      }
    } else {
      for (const s of allSpecs) {
        try {
          packed.push(await packAndOptionallyWrite(s));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logFail(s.packageName, `pack/inspect: ${msg}`);
          fail(s, 'pack', msg);
        }
      }
    }

    // Phase B: bootstrap shared consumer scaffolding. Use `allSpecs` so
    // peer/extra deps for any installed package are present even when the
    // checked-set is filtered.
    log('phase', 'bootstrap shared consumer');
    bootstrapConsumer(consumerDir, allSpecs);

    // Phase C: install all tarballs in a single npm-install call. Passing
    // every tarball at once lets npm resolve cross-package `workspace:*` deps
    // through `file:`-protocol siblings without hitting the public registry.
    // Sequential per-spec installs would require topological ordering and
    // each call still needs every previously-installed sibling resolvable —
    // a single install fixes that.
    log('phase', 'install tarballs');
    let installOk = true;
    let installError: string | null = null;
    try {
      installAllTarballs(
        packed.map((p) => p.tgzPath),
        consumerDir,
      );
    } catch (err) {
      installOk = false;
      installError = err instanceof Error ? err.message : String(err);
      logFail('install', installError);
    }
    const installed: PackedSpec[] = installOk ? packed : [];
    if (!installOk) {
      // Stamp every spec we tried to install with the install error so the
      // summary reports it precisely.
      for (const p of packed) {
        if (!results.has(p.spec.packageName)) {
          fail(p.spec, 'install', installError ?? 'install failed');
        }
      }
    }

    // Phase D: shared typecheck — picks up every consumer-*.ts.
    log('phase', 'tsc --noEmit (shared)');
    let typecheckOk = true;
    let typecheckError: string | null = null;
    try {
      typecheckConsumer(consumerDir);
    } catch (err) {
      typecheckOk = false;
      typecheckError = err instanceof Error ? err.message : String(err);
      logFail('typecheck', typecheckError);
    }

    // Phase E: per-spec runtime + bin (only for checked specs). These are
    // independent processes; safe to run in parallel.
    log('phase', `runtime + bin (${FLAGS.parallel ? 'parallel' : 'sequential'})`);

    // eslint-disable-next-line @typescript-eslint/require-await
    async function runChecks(p: PackedSpec): Promise<void> {
      if (!checkedNames.has(p.spec.packageName)) {
        // Pack-only — record as PASS so the summary shows it was packed +
        // installed, just not deeply consumer-checked (filter mode).
        if (!results.has(p.spec.packageName)) pass(p.spec);
        return;
      }
      // If install already failed, skip — already stamped.
      if (results.has(p.spec.packageName)) return;
      if (!typecheckOk) {
        fail(p.spec, 'typecheck', typecheckError ?? 'typecheck failed');
        return;
      }
      try {
        runtimeCheck(consumerDir, p.consumerFiles.mjs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logFail(p.spec.packageName, `runtime: ${msg}`);
        fail(p.spec, 'runtime', msg);
        return;
      }
      try {
        binCheck(p.spec, consumerDir);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logFail(p.spec.packageName, `bin: ${msg}`);
        fail(p.spec, 'bin', msg);
        return;
      }
      pass(p.spec);
      log(
        p.spec.packageName,
        `ok (${Date.now() - (startTimes.get(p.spec.packageName) ?? Date.now())}ms)`,
      );
    }

    if (FLAGS.parallel) {
      await Promise.all(installed.map(runChecks));
    } else {
      for (const p of installed) await runChecks(p);
    }
  } finally {
    if (FLAGS.keep) {
      console.log(`[smoke-test-pack] kept scratch dir: ${scratchDir}`);
    } else {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }

  // Summary.
  const totalMs = Date.now() - startedAt;
  console.log('');
  console.log(`[smoke-test-pack] summary (${(totalMs / 1000).toFixed(1)}s wall):`);
  const ordered: SpecResult[] = [];
  for (const s of allSpecs) {
    const r = results.get(s.packageName);
    if (r) ordered.push(r);
  }
  let nameWidth = 0;
  for (const r of ordered) nameWidth = Math.max(nameWidth, r.packageName.length);
  for (const r of ordered) {
    const status = r.ok ? 'PASS' : 'FAIL';
    const phase = r.ok ? '-' : (r.phase ?? '-');
    const duration = `${r.durationMs}ms`;
    console.log(
      `  ${r.packageName.padEnd(nameWidth)}  ${status.padEnd(4)}  ${phase.padEnd(10)}  ${duration}`,
    );
  }
  const failed = ordered.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log('');
    console.error(`[smoke-test-pack] ${failed.length}/${ordered.length} package(s) failed.`);
    process.exit(1);
  }
  console.log(`[smoke-test-pack] ok — ${ordered.length} package(s) consumable.`);
}

main().catch((err: unknown) => {
  console.error('[smoke-test-pack] uncaught error:', err);
  process.exit(1);
});
