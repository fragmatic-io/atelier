// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, openServices } from '../packages/control-plane/src/config.mjs';
import { BuildPipeline } from '../packages/control-plane/src/pipeline.mjs';
import { seedDemo } from './seed-demo.mjs';
import { SourceRegistry } from '../packages/source-forge/src/registry.mjs';
import { ConversationService } from '../packages/conversation/src/service.mjs';

export function recordSeedFailure(services, job, error) {
  const current = services.db.get(
    'SELECT status FROM jobs WHERE tenant_id=? AND project_id=? AND id=?',
    job.tenant_id,
    job.project_id,
    job.id,
  );
  if (current?.status === 'running')
    services.service.store.finish(job, null, {
      code: error.code ?? 'CERTIFY_FAILED',
      message: error.message,
    });
}
export async function seedExperiences(
  services,
  config,
  { kitIds = ['delivery-board', 'customer-context'] } = {},
) {
  if (config.production) throw new Error('Reference seeding is development-only');
  const { db, service } = services;
  assertIdle();
  const link = await seedDemo(service, { resume: true });
  if (link.password) console.log('Local account:', link.email, 'password:', link.password);
  const who = { userId: db.get('SELECT id FROM users WHERE email=?', 'builder@example.test').id };
  let project = service.project(who, link.tenantId, link.projectId);
  if (project.settings.separationOfDuties)
    service.updateProject(who, link.tenantId, link.projectId, {
      revision: project.revision,
      settings: { separationOfDuties: false },
    });
  for (const name of ['customer.get', 'intervention.create']) {
    const cap = service
      .model(who, link.tenantId, link.projectId)
      .capabilities.find((c) => c.id === name);
    if (!cap.securityReviewed)
      service.reviewCapability(who, link.tenantId, link.projectId, name, {
        confirmed: true,
        note: 'Explicit reviewed local fixture contract',
        risk: cap.kind === 'query' ? 'read_only' : 'sensitive',
        confirmation: cap.kind === 'query' ? 'none' : 'modal',
        requiredPermissions: cap.kind === 'query' ? ['customer.read'] : ['customer.intervene'],
        piiFields: name === 'customer.get' ? ['email'] : [],
        reversible: cap.kind === 'query',
      });
  }
  const registry = new SourceRegistry(service),
    chat = new ConversationService(service),
    pipeline = new BuildPipeline(service);
  const selected = [];
  for (const name of kitIds) {
    const kit = JSON.parse(
      await readFile(new URL(`../examples/source-kits/${name}.json`, import.meta.url)),
    );
    const c = await registry.import(who, link.tenantId, link.projectId, { kit });
    let row = registry.get(who, link.tenantId, link.projectId, c.id);
    if (row.status === 'draft') {
      const queued = registry.queueCertification(who, link.tenantId, link.projectId, c.id),
        job = service.store.claim('reference-certifier', { leaseMs: 300000 });
      if (!job || job.id !== queued.id) throw new Error('Reference seeding requires an idle queue');
      try {
        const result = await pipeline.execute(job);
        service.store.finish(job, result);
        if (!result.passed) throw new Error('Reference browser acceptance failed');
      } catch (e) {
        recordSeedFailure(services, job, e);
        throw e;
      }
      registry.approve(who, link.tenantId, link.projectId, c.id, {
        digest: c.digest,
        previewReviewed: true,
        tasksReviewed: true,
        note: 'Curated original development example after executed browser acceptance. Not automatic approval of arbitrary generated source.',
      });
    }
    row = registry.get(who, link.tenantId, link.projectId, c.id);
    if (row.status === 'approved') registry.publish(who, link.tenantId, link.projectId, c.id);
    selected.push(c.id);
    console.log('Reference source published:', name);
  }
  chat.setup(who, link.tenantId, link.projectId, {
    tools: ['customer.get', 'intervention.create'],
    enableCommands: true,
    componentIds: selected,
    voiceReviewed: true,
    voice: {
      name: 'Northstar assistant',
      tone: 'Calm, helpful, precise. Distinguish actual host data from demonstrations.',
      locale: 'en',
    },
  });
  let provider = db.get(
    'SELECT id FROM connections WHERE tenant_id=? AND name=?',
    link.tenantId,
    'Offline fixture (no live model)',
  );
  if (!provider)
    provider = service.createConnection(who, link.tenantId, {
      name: 'Offline fixture (no live model)',
      kind: 'openai',
      apiKey: 'offline-fixture-not-a-real-key',
      model: 'offline-fixture',
    });
  project = service.project(who, link.tenantId, link.projectId);
  service.updateProject(who, link.tenantId, link.projectId, {
    revision: project.revision,
    providerId: provider.id,
    modelName: 'offline-fixture',
  });
  const token = service.createToken(who, link.tenantId, link.projectId, {
    name: 'Local agent host',
    scopes: ['read', 'run', 'agent'],
    days: 7,
  });
  const result = {
    tenantId: link.tenantId,
    projectId: link.projectId,
    token: token.token,
    componentIds: selected,
  };
  const path = join(config.dataDir, 'agent-demo-link.json');
  await writeFile(path, JSON.stringify(result, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
  console.log('Server-only connection saved to the development data directory.');
  return result;
  function assertIdle() {
    if (db.get("SELECT count(*) n FROM jobs WHERE status IN ('queued','running')").n)
      throw new Error('Stop workers and empty the development queue before seeding');
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const config = await loadConfig();
  const services = openServices(config);
  try {
    await seedExperiences(services, config, {
      kitIds: process.argv.includes('--all')
        ? [
            'booking-flow',
            'capacity-analytics',
            'customer-context',
            'delivery-board',
            'evidence-review',
            'experiment-comparison',
            'journey-map',
            'learning-lab',
            'storyboard',
          ]
        : undefined,
    });
  } finally {
    services.db.close();
  }
}
