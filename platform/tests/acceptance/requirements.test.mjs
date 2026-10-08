import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRequirements } from '../../scripts/acceptance/requirements.mjs';

test('core requirements contain no missing or partial implementation', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = await validateRequirements(root, 'core');
  assert(result.count >= 20);
  assert.equal(result.statuses.missing, 0);
  assert.equal(result.statuses.partial, 0);
});

test('neither blocked nor verified ledger labels can authorize a release', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'atelier-requirements-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs/v2.3'), { recursive: true });
  await writeFile(join(root, 'contract.mjs'), '// synthetic requirements-path fixture\n');
  const item = {
    id: 'V23-OPS-01', behavior: 'A concrete externally evidenced release requirement.',
    classification: 'live', implementation: ['contract.mjs'], tests: ['contract.mjs'],
    status: 'externally_blocked', limitations: ['Synthetic evidence is intentionally absent.'],
  };
  for (const status of ['externally_blocked', 'verified']) {
    item.status = status;
    await writeFile(join(root, 'docs/v2.3/REQUIREMENTS.json'), JSON.stringify({
      schemaVersion: 1, release: '2.3.0-rc.1', requirements: [item],
    }));
    const result = await validateRequirements(root, 'release');
    assert.equal(result.canAuthorizeRelease, false);
    assert.equal(result.declaredAllVerified, status === 'verified');
    assert.equal(result.releaseReady, undefined);
  }
  item.status = 'partial';
  await writeFile(join(root, 'docs/v2.3/REQUIREMENTS.json'), JSON.stringify({
    schemaVersion: 1, release: '2.3.0-rc.1', requirements: [item],
  }));
  await assert.rejects(validateRequirements(root, 'core'), /is partial/);
});
