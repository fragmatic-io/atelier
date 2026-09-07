import { Database } from '../../packages/control-plane/src/db.mjs';
import { SecretBox } from '../../packages/control-plane/src/crypto.mjs';
import { AuthService } from '../../packages/control-plane/src/auth.mjs';
import { ControlService } from '../../packages/control-plane/src/services.mjs';
import { BuildPipeline } from '../../packages/control-plane/src/pipeline.mjs';
import { createSnapshot } from '../../scripts/snapshot.mjs';
import { fileURLToPath } from 'node:url';
export const sample = fileURLToPath(new URL('../../fixtures/sample-app/', import.meta.url));
export const password = 'a durable test phrase 7265';
export async function fixture({ clock, dbPath = ':memory:' } = {}) {
  const db = new Database(dbPath);
  const box = new SecretBox({ keys: { test: Buffer.alloc(32, 7) }, activeKeyId: 'test' });
  const auth = new AuthService(db, box, { clock });
  const service = new ControlService(db, box, auth, { clock });
  const user = await auth.createUser({
    email: 'builder@example.test',
    password,
    displayName: 'Builder',
  });
  const who = { userId: user.id };
  const tenant = service.createTenant(who, { name: 'Northstar' });
  const project = service.createProject(who, tenant.id, { name: 'Support' });
  return { db, box, auth, service, user, who, tenant, project };
}
export async function runJob(f, { apiFactory } = {}) {
  // Direct test execution has no WorkerLoop heartbeat. Keep the lease bounded,
  // but long enough for CPU-contended acceptance runs on supported laptops.
  const job = f.service.store.claim('test-worker', { leaseMs: 300_000 });
  if (!job) throw new Error('No queued job');
  try {
    const result = await new BuildPipeline(f.service, { apiFactory }).execute(job);
    f.service.store.finish(job, result);
    return result;
  } catch (e) {
    f.service.store.finish(job, null, { code: e.code, message: e.message });
    throw e;
  }
}
export async function scanned(f) {
  let p = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, p.id, {
    revision: p.revision,
    settings: {
      slots: [
        {
          id: 'customer.detail.right-rail',
          mode: 'inline',
          allowedCapabilityGroups: ['customer.', 'intervention.'],
          allowWriteActions: true,
        },
      ],
      separationOfDuties: false,
    },
  });
  f.service.upload(f.who, f.tenant.id, p.id, await createSnapshot(sample));
  return runJob(f);
}
export async function generated(f, { mode = 'deterministic', variants = 3, apiFactory } = {}) {
  f.service.generate(f.who, f.tenant.id, f.project.id, {
    slotId: 'customer.detail.right-rail',
    goal: 'Understand customer context and choose an intervention',
    role: 'support_manager',
    permissions: ['customer.read', 'customer.intervene', 'customer.archive'],
    mode,
    variants,
  });
  return runJob(f, { apiFactory });
}
