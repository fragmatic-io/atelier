import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateRequirements } from '../../scripts/acceptance/requirements.mjs';

test('core requirements contain no missing or partial implementation', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = await validateRequirements(root, 'core');
  assert(result.count >= 20);
  assert.equal(result.statuses.missing, 0);
  assert.equal(result.statuses.partial, 0);
});

test('release profile refuses externally blocked evidence', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await assert.rejects(validateRequirements(root, 'release'), /release profile requires verified/);
});
