import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectSourceBinding, sameBinding, sha256 } from '../../scripts/acceptance/binding.mjs';
import { TEST_TOOLCHAIN } from './evidence-fixtures.mjs';

async function checkout(t) {
  const root = await mkdtemp(join(tmpdir(), 'atelier-binding-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const platform = join(root, 'platform');
  await mkdir(platform);
  await writeFile(join(root, '.gitignore'), '*.log\n');
  await writeFile(join(platform, 'package-lock.json'), '{"synthetic":true}\n');
  await writeFile(join(platform, 'app.mjs'), 'export const version = 1;\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('add', '.');
  // This is an isolated temporary test repository, never the product checkout.
  git('-c', 'user.name=Atelier Binding Test', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic verifier test');
  return { root, platform, git, collect: () => collectSourceBinding(platform, { toolchain: TEST_TOOLCHAIN }) };
}

test('release binding fingerprints the clean actual checkout and toolchain deterministically', async (t) => {
  const fixture = await checkout(t);
  const first = await fixture.collect();
  assert.equal(first.clean, true);
  assert.equal(first.gitCommit, fixture.git('rev-parse', 'HEAD'));
  assert.equal(first.packageLockSha256, sha256('{"synthetic":true}\n'));
  assert.equal(sameBinding(first, await fixture.collect()), true);
  await writeFile(join(fixture.root, 'local.log'), 'Ignored execution output\n');
  assert.equal(sameBinding(first, await fixture.collect()), true);
});

test('modified and untracked source change the fingerprint without changing HEAD', async (t) => {
  const fixture = await checkout(t);
  const first = await fixture.collect();
  await writeFile(join(fixture.platform, 'app.mjs'), 'export const version = 2;\n');
  const changed = await fixture.collect();
  assert.equal(changed.gitCommit, first.gitCommit);
  assert.equal(changed.clean, false);
  assert.notEqual(changed.sourceTreeSha256, first.sourceTreeSha256);
  await writeFile(join(fixture.platform, 'new-test.mjs'), 'export const newContract = true;\n');
  const untracked = await fixture.collect();
  assert.equal(untracked.clean, false);
  assert.notEqual(untracked.sourceTreeSha256, changed.sourceTreeSha256);
});

test('index flags cannot hide tracked edits behind a clean release binding', async (t) => {
  for (const flag of ['assume-unchanged', 'skip-worktree']) {
    const fixture = await checkout(t);
    const first = await fixture.collect();
    fixture.git('update-index', `--${flag}`, 'platform/app.mjs');
    assert.equal(fixture.git('status', '--porcelain=v1'), '');
    const flagged = await fixture.collect();
    assert.equal(flagged.clean, false, `${flag} must block a clean release claim`);
    assert.equal(flagged.sourceTreeSha256, first.sourceTreeSha256);
    await writeFile(join(fixture.platform, 'app.mjs'), 'export const version = 2;\n');
    assert.equal(fixture.git('status', '--porcelain=v1'), '', `${flag} hides the tracked edit from status`);
    const changed = await fixture.collect();
    assert.equal(changed.clean, false);
    assert.equal(changed.gitCommit, first.gitCommit);
    assert.notEqual(changed.sourceTreeSha256, first.sourceTreeSha256);
    await writeFile(join(fixture.platform, 'app.mjs'), 'export const version = 1;\n');
    fixture.git('update-index', `--no-${flag}`, 'platform/app.mjs');
    assert.equal(sameBinding(await fixture.collect(), first), true);
  }
});

test('source symlinks bind the link target rather than reading outside checkout', async (t) => {
  const fixture = await checkout(t);
  await symlink('/this-target-does-not-exist', join(fixture.platform, 'reference'));
  const first = await fixture.collect();
  assert.equal(first.clean, false);
  await rm(join(fixture.platform, 'reference'));
  await symlink('/another-target-does-not-exist', join(fixture.platform, 'reference'));
  assert.notEqual((await fixture.collect()).sourceTreeSha256, first.sourceTreeSha256);
});
