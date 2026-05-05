// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * Release driver — bumps every `@atelier/*` workspace package in lockstep,
 * commits the bump, tags it, and publishes the workspace.
 *
 * Lockstep policy: all 15 framework packages share a single SemVer track.
 * `@atelier/runtime@0.6.0` is always paired with `@atelier/react@0.6.0`.
 * See `docs/release-policy.md` for the full policy.
 *
 * Flow:
 *   1. `pnpm validate` — green gate
 *   2. `pnpm test` — green gate (covered by validate, kept explicit)
 *   3. `pnpm smoke-test:pack` — green gate (delegates to scripts/smoke-test-pack.ts)
 *   4. Bump every `packages/* / package.json` `version` field to <next>.
 *      `workspace:^` deps stay as-is — pnpm substitutes the published version
 *      at pack time (verified by `pnpm pack` inspection).
 *   5. Commit `chore(release): vX.Y.Z`.
 *   6. Tag `vX.Y.Z`.
 *   7. `pnpm -r --filter "./packages/*" publish` (or --dry-run if not --real).
 *   8. If --real, `git push origin <branch>` + `git push origin <tag>`.
 *
 * Usage:
 *   pnpm release patch                # 0.5.0 -> 0.5.1, dry-run publish
 *   pnpm release minor                # 0.5.0 -> 0.6.0
 *   pnpm release major                # 0.5.0 -> 1.0.0
 *   pnpm release 0.5.3                # explicit
 *   pnpm release patch --real         # actually publish to npm
 *   pnpm release patch --skip-validate  # emergency hotfix path (warns loudly)
 *
 * Defaults to dry-run publish so you can rehearse the release without touching
 * the registry. The version-bump commit + tag are still created locally; if
 * you want to back out, `git reset --hard HEAD~1 && git tag -d vX.Y.Z`.
 */

/* eslint-disable no-console */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_DIR = join(ROOT, 'packages');

interface Args {
  bump: 'patch' | 'minor' | 'major' | 'explicit';
  explicitVersion: string | null;
  real: boolean;
  skipValidate: boolean;
  skipSmoke: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  if (positional.length === 0) {
    fail('usage: pnpm release <patch|minor|major|x.y.z> [--real] [--skip-validate] [--skip-smoke]');
  }
  const head = positional[0]!;
  const real = flags.has('--real');
  const skipValidate = flags.has('--skip-validate');
  const skipSmoke = flags.has('--skip-smoke');
  if (head === 'patch' || head === 'minor' || head === 'major') {
    return { bump: head, explicitVersion: null, real, skipValidate, skipSmoke };
  }
  if (/^\d+\.\d+\.\d+$/.test(head)) {
    return { bump: 'explicit', explicitVersion: head, real, skipValidate, skipSmoke };
  }
  fail(`bad version argument: ${head}`);
}

function fail(msg: string): never {
  console.error(`[release] FAIL: ${msg}`);
  process.exit(1);
}

function log(msg: string): void {
  console.log(`[release] ${msg}`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function run(cmd: string, args: readonly string[], opts: { dryLog?: string } = {}): void {
  log(opts.dryLog ?? `${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    fail(`command failed (exit ${result.status}): ${cmd} ${args.join(' ')}`);
  }
}

function listPackageDirs(): string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(PACKAGES_DIR, e.name))
    .filter((d) => {
      try {
        return readdirSync(d).includes('package.json');
      } catch {
        return false;
      }
    });
}

interface PackageManifest {
  name: string;
  version: string;
  private?: boolean;
}

function readWorkspaceVersions(): Map<string, string> {
  const versions = new Map<string, string>();
  for (const dir of listPackageDirs()) {
    const pkg = readJson<PackageManifest>(join(dir, 'package.json'));
    versions.set(pkg.name, pkg.version);
  }
  return versions;
}

function assertLockstep(versions: Map<string, string>): string {
  const distinct = new Set(versions.values());
  if (distinct.size !== 1) {
    const detail = Array.from(versions.entries())
      .map(([n, v]) => `  ${n} @ ${v}`)
      .join('\n');
    fail(
      `workspace versions are not in lockstep — release policy requires every @atelier/* package at the same version:\n${detail}`,
    );
  }
  return Array.from(distinct)[0]!;
}

function bumpVersion(current: string, kind: Args['bump'], explicit: string | null): string {
  if (kind === 'explicit') {
    if (!explicit) fail('explicit bump requires a version argument');
    return explicit;
  }
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) fail(`current version is not SemVer-shaped: ${current}`);
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function writeNewVersion(nextVersion: string): readonly string[] {
  const touched: string[] = [];
  for (const dir of listPackageDirs()) {
    const path = join(dir, 'package.json');
    const pkg = readJson<PackageManifest & Record<string, unknown>>(path);
    if (pkg.private === true) {
      // Internal-only packages stay outside the lockstep version track.
      continue;
    }
    pkg.version = nextVersion;
    writeJson(path, pkg);
    touched.push(path);
  }
  return touched;
}

function ensureCleanGit(): void {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (status.trim().length > 0) {
    fail(
      `working tree is dirty — release requires a clean tree so the bump commit is reviewable:\n${status}`,
    );
  }
}

function gitTagExists(tag: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function currentBranch(): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  log(`mode: ${args.real ? 'REAL publish to npm' : 'dry-run (no registry side-effects)'}`);

  if (args.skipValidate) {
    console.warn('');
    console.warn(
      '[release] !!! --skip-validate is set. Validate gate (typecheck + lint + test) is BYPASSED.',
    );
    console.warn(
      '[release] !!! Use only for emergency hotfixes. You are responsible for the diff.',
    );
    console.warn('');
  }

  ensureCleanGit();

  const versions = readWorkspaceVersions();
  const currentVersion = assertLockstep(versions);
  log(`workspace lockstep version: ${currentVersion} (${versions.size} packages)`);

  const nextVersion = bumpVersion(currentVersion, args.bump, args.explicitVersion);
  log(`next version: ${nextVersion}`);

  const tag = `v${nextVersion}`;
  if (gitTagExists(tag)) {
    fail(`tag ${tag} already exists locally — pick a different version`);
  }

  // 1. Validate gate.
  if (!args.skipValidate) {
    run('pnpm', ['validate']);
  } else {
    log('skip: pnpm validate (--skip-validate)');
  }

  // 2. Smoke-test gate. Delegates to scripts/smoke-test-pack.ts which packs
  //    @atelier/schemas + the migrated workspace dist artifacts and verifies
  //    a downstream consumer can install + import + execute. Sprint 1.3 is
  //    extending this to cover all 15 packages; release.ts intentionally
  //    invokes the script (not the logic) so we always pick up the latest gate.
  if (!args.skipSmoke) {
    run('pnpm', ['smoke-test:pack']);
  } else {
    log('skip: pnpm smoke-test:pack (--skip-smoke)');
  }

  // 3. Bump every public package version in lockstep.
  const touched = writeNewVersion(nextVersion);
  log(`bumped ${touched.length} package.json files to ${nextVersion}`);

  // 4. Refresh the lockfile so workspace:^ entries stay coherent. `--lockfile-only`
  //    keeps node_modules untouched; the build artifacts produced by `pnpm validate`
  //    above remain valid.
  run('pnpm', ['install', '--lockfile-only']);

  // 5. Stage + commit. Use explicit-path adds (per op-debt: lint-staged --no-stash
  //    is now default; explicit-path adds reduce surprises for sibling agents).
  const stage: string[] = ['pnpm-lock.yaml', ...touched.map((p) => p.replace(`${ROOT}/`, ''))];
  run('git', ['add', ...stage]);

  const commitMsg = `chore(release): ${tag}\n\nLockstep bump of all @atelier/* packages from ${currentVersion} to ${nextVersion}.`;
  run('git', ['commit', '-m', commitMsg]);

  // 6. Tag.
  run('git', ['tag', '-a', tag, '-m', `Atelier ${tag}`]);
  log(`created tag ${tag}`);

  // 7. Publish.
  const publishArgs = ['-r', '--filter', './packages/*', 'publish', '--no-git-checks'];
  if (!args.real) publishArgs.push('--dry-run');
  run('pnpm', publishArgs);

  // 8. Push.
  if (args.real) {
    const branch = currentBranch();
    run('git', ['push', 'origin', branch]);
    run('git', ['push', 'origin', tag]);
    log(`pushed branch ${branch} + tag ${tag} to origin`);
  } else {
    log(`dry-run: skipped git push (commit + tag are local only)`);
    log(`to back out the local commit: git reset --hard HEAD~1 && git tag -d ${tag}`);
  }

  log(`done — released ${tag}`);
}

main();
