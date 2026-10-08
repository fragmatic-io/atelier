import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../packages/control-plane/src/db.mjs';
import { SecretBox } from '../packages/control-plane/src/crypto.mjs';
import { AuthService } from '../packages/control-plane/src/auth.mjs';
import { ControlService } from '../packages/control-plane/src/services.mjs';
import { seedDemo } from '../scripts/seed-demo.mjs';
import { runJob } from './v21/helpers.mjs';

test('fresh demo seeding declares the real customer context while preserving query permissions and reviewed actions', async (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const box = new SecretBox({ keys: { test: Buffer.alloc(32, 7) }, activeKeyId: 'test' });
  const auth = new AuthService(db, box);
  const service = new ControlService(db, box, auth);
  const seeded = await seedDemo(service, { password: 'Synthetic-Demo-Fixture-2026!' });
  const identity = { userId: db.get('SELECT id FROM users WHERE email=?', seeded.email).id };
  const model = service.model(identity, seeded.tenantId, seeded.projectId);
  const slot = model.slots.find((item) => item.id === 'customer.detail.right-rail');
  assert.deepEqual(slot.contextSchema.required, ['customerId']);
  assert.deepEqual(slot.contextSchema.properties.customerId, { type: 'string' });
  const query = model.capabilities.find((item) => item.id === 'customer.get');
  assert.ok(query.inputSchema.required.includes('customerId'));
  assert.ok(query.requiredPermissions.includes('customer.read'));
  assert.equal(seeded.releaseIds.length, 3);
  for (const releaseId of seeded.releaseIds) {
    const release = service.release(identity, seeded.tenantId, seeded.projectId, releaseId);
    assert.equal(release.status, 'draft');
    assert.ok(release.artifact.bundle.experiencePlan.queryPlan.some((item) => item.capabilityId === 'customer.get'));
    assert.ok(release.artifact.bundle.actionContracts.length > 0);
    for (const action of release.artifact.bundle.actionContracts) {
      assert.equal(action.securityReviewed, true);
      assert.equal(action.confirmation, 'modal');
      assert.ok(action.requiredPermissions.length > 0);
    }
  }
  service.generate(identity, seeded.tenantId, seeded.projectId, {
    goal: 'Review customer context without read authority',
    slotId: slot.id, role: 'viewer', permissions: [], mode: 'deterministic', variants: 1,
  });
  await assert.rejects(runJob({ service }), { code: 'NO_INFORMATION' });
  assert.equal(service.releases(identity, seeded.tenantId, seeded.projectId).length, 3);
});
