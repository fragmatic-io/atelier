import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { projectAccess } from '../../packages/control-plane/src/access.mjs';
import { Database } from '../../packages/control-plane/src/db.mjs';
import { SecretBox, totp } from '../../packages/control-plane/src/crypto.mjs';
test('job fence prevents stale worker finish after lease takeover', async (t) => {
  let now = Date.now();
  const f = await fixture({ clock: () => now });
  t.after(() => f.db.close());
  const s = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  f.service.store.enqueue(s, 'scan', { snapshotId: 'test' });
  const j = f.service.store.claim('one', { leaseMs: 100 });
  assert.ok(j);
  now += 101;
  const j2 = f.service.store.claim('two', { leaseMs: 100 });
  assert.ok(j2.fence > j.fence);
  assert.equal(f.service.store.heartbeat(j), false);
  assert.equal(f.service.store.finish(j, {}), false);
  assert.equal(f.service.store.finish(j2, {}), true);
});
test('cancellation fences queued work and deduplicates client retries', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const s = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const a = f.service.store.enqueue(s, 'scan', { a: 1 }, { dedupeKey: 'x' }),
    b = f.service.store.enqueue(s, 'scan', { a: 1 }, { dedupeKey: 'x' });
  assert.equal(a.id, b.id);
  f.service.store.cancel(s, a.id);
  assert.equal(f.service.store.claim('worker'), null);
});
test('explicit terminal retry preserves failed history and queues one replacement', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const s = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const first = f.service.store.enqueue(s, 'design-synthesis', { contract: 'a' }, {
    dedupeKey: 'design:a',
    retryTerminal: true,
  });
  const claimed = f.service.store.claim('worker');
  assert.equal(claimed.id, first.id);
  assert.equal(f.service.store.finish(claimed, null, { code: 'CLI_EXIT' }), true);

  const retry = f.service.store.enqueue(s, 'design-synthesis', { contract: 'a' }, {
    dedupeKey: 'design:a',
    retryTerminal: true,
  });
  assert.notEqual(retry.id, first.id);
  assert.equal(retry.status, 'queued');
  assert.equal(
    f.db.get('SELECT status FROM jobs WHERE id=?', first.id).status,
    'failed',
  );
  const duplicate = f.service.store.enqueue(s, 'design-synthesis', { contract: 'a' }, {
    dedupeKey: 'design:a',
    retryTerminal: true,
  });
  assert.equal(duplicate.id, retry.id);
});
test('database online backup restores immutable artifacts, secrets and migration checks', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'atelier-backup-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const f = await fixture({ dbPath: join(dir, 'main.sqlite') });
  const s = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const a = f.service.store.artifact(s, 'example', { ok: true });
  await f.db.backup(join(dir, 'backup.sqlite'));
  assert.equal(f.db.integrity(), true);
  f.db.close();
  const restored = new Database(join(dir, 'backup.sqlite'));
  assert.equal(restored.integrity(), true);
  assert.equal(
    JSON.parse(restored.get('SELECT content_json FROM artifacts WHERE id=?', a.id).content_json).ok,
    true,
  );
  restored.run('UPDATE schema_migrations SET checksum=?', 'tampered');
  restored.close();
  assert.throws(() => new Database(join(dir, 'backup.sqlite')), /modified after/i);
});
test('encrypted secrets bind tenant/project AAD and key rotation preserves values', () => {
  const box = new SecretBox({
    keys: { a: Buffer.alloc(32, 1), b: Buffer.alloc(32, 2) },
    activeKeyId: 'a',
  });
  const ciphertext = box.seal('private', 'tenant:a:project:x');
  assert.equal(box.open(ciphertext, 'tenant:a:project:x'), 'private');
  assert.throws(() => box.open(ciphertext, 'tenant:b:project:x'));
  const next = new SecretBox({
    keys: { a: Buffer.alloc(32, 1), b: Buffer.alloc(32, 2) },
    activeKeyId: 'b',
  });
  assert.equal(
    next.open(next.rewrap(ciphertext, 'tenant:a:project:x'), 'tenant:a:project:x'),
    'private',
  );
});
