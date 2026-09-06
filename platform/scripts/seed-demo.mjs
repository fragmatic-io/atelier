// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createSnapshot } from './snapshot.mjs';
import { BuildPipeline } from '../packages/control-plane/src/pipeline.mjs';
export async function seedDemo(
  service,
  {
    email = 'builder@example.test',
    password = process.env.ATELIER_DEMO_PASSWORD ?? randomBytes(18).toString('base64url'),
    name = 'Alex Morgan',
    resume = false,
  } = {},
) {
  const any = service.db.get('SELECT id FROM users LIMIT 1');
  if (any && !resume) return { existing: true };
  let user = service.db.get('SELECT id FROM users WHERE email=?', email);
  const created = !user;
  if (!user) {
    if (any)
      throw new Error(
        'Existing installation has no demo operator. Use a fresh development directory.',
      );
    user = await service.auth.createUser({ email, password, displayName: name });
  }
  const identity = { userId: user.id };
  let tenant = service.db.get(
    "SELECT t.* FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE t.slug=? AND m.user_id=? AND m.role='owner'",
    'northstar',
    user.id,
  );
  if (!tenant)
    tenant = service.createTenant(identity, { name: 'Northstar Studio', slug: 'northstar' });
  let project = service.projects(identity, tenant.id).find((p) => p.slug === 'customer-operations');
  if (!project) {
    project = service.createProject(identity, tenant.id, {
      name: 'Customer Operations',
      description: 'Context and confident next steps.',
    });
    project = service.updateProject(identity, tenant.id, project.id, {
      revision: project.revision,
      settings: {
        slots: [
          {
            id: 'customer.detail.right-rail',
            mode: 'inline',
            allowedCapabilityGroups: ['customer.', 'intervention.'],
            allowWriteActions: true,
            allowedPiiFields: [],
            maxAdaptationLevel: 2,
          },
        ],
      },
    });
  }
  let other = service.projects(identity, tenant.id).find((p) => p.slug === 'field-operations');
  if (!other)
    other = service.createProject(identity, tenant.id, {
      name: 'Field Operations',
      description: 'Exceptions and work on the ground.',
    });
  const pipeline = new BuildPipeline(service);
  async function run(jobId) {
    const job = service.store.claim('explicit-demo-seed', { leaseMs: 300000 });
    if (!job || job.id !== jobId)
      throw new Error('Demo seeding requires an idle development queue.');
    try {
      const value = await pipeline.execute(job);
      service.store.finish(job, value);
      return value;
    } catch (e) {
      service.store.finish(job, null, { code: e.code ?? 'SEED_FAILED', message: e.message });
      throw e;
    }
  }
  if (!service.project(identity, tenant.id, project.id).modelId) {
    const snapshot = await createSnapshot(
      fileURLToPath(new URL('../fixtures/sample-app', import.meta.url)),
    );
    await run(service.upload(identity, tenant.id, project.id, snapshot).id);
  }
  let releases = service.releases(identity, tenant.id, project.id);
  if (!releases.length) {
    for (const c of service
      .model(identity, tenant.id, project.id)
      .capabilities.filter(
        (c) => c.kind === 'command' && ['intervention.create', 'customer.archive'].includes(c.id),
      ))
      service.reviewCapability(identity, tenant.id, project.id, c.id, {
        confirmed: true,
        note: 'Explicit development fixture review',
        risk: c.risk,
        confirmation: 'modal',
        requiredPermissions: c.requiredPermissions,
        piiFields: c.piiFields,
        reversible: false,
      });
    const job = service.generate(identity, tenant.id, project.id, {
      goal: 'Understand customer health and the next intervention',
      slotId: 'customer.detail.right-rail',
      role: 'support_manager',
      permissions: ['customer.read', 'customer.intervene', 'customer.archive'],
      mode: 'deterministic',
      variants: 3,
    });
    await run(job.id);
    releases = service.releases(identity, tenant.id, project.id);
  }
  return {
    existing: !created,
    email,
    ...(created ? { password } : {}),
    tenantId: tenant.id,
    projectId: project.id,
    otherProjectId: other.id,
    releaseIds: releases.map((r) => r.id),
  };
}
