import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGate } from '../../scripts/acceptance/process.mjs';

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'atelier-gate-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('an exit-zero command without output is not accepted as evidence', async (t) => {
  const root = await directory(t);
  const result = await runGate(root, root, 'empty', [process.execPath, '-e', '']);
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /no evidence output/);
});

test('required Node tests must actually execute and cannot be skipped', async (t) => {
  const root = await directory(t);
  const path = join(root, 'contract.test.mjs');
  await writeFile(path, "import test from 'node:test'; test('required behavior', {skip:true}, () => {});\n");
  const skipped = await runGate(root, root, 'skipped', [process.execPath, '--test', '--test-reporter=tap', path], { requireTests: true });
  assert.equal(skipped.exitCode, 0);
  assert.equal(skipped.status, 'failed');
  assert.equal(skipped.testSummary.skipped, 1);
  await writeFile(path, "import test from 'node:test'; import assert from 'node:assert/strict'; test('required behavior', () => assert.equal(2 + 2, 4));\n");
  const passed = await runGate(root, root, 'executed', [process.execPath, '--test', '--test-reporter=tap', path], { requireTests: true });
  assert.equal(passed.status, 'passed');
  assert.equal(passed.testSummary.pass, 1);
});

test('a timed-out process never passes', async (t) => {
  const root = await directory(t);
  const result = await runGate(root, root, 'deadline', [process.execPath, '-e', 'console.log("started"); setInterval(() => {}, 1000)'], { timeoutMs: 300 });
  assert.equal(result.timedOut, true);
  assert.equal(result.status, 'failed');
});
