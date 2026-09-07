import { readFile } from 'node:fs/promises';
import { fixture, scanned, runJob, password } from '../v21/helpers.mjs';
import { SourceRegistry } from '../../packages/source-forge/src/registry.mjs';
import { ConversationService } from '../../packages/conversation/src/service.mjs';
import { hash } from '../../packages/conversation/src/common.mjs';
export { runJob, password };
export async function ready({ review = false } = {}) {
  const f = await fixture();
  await scanned(f);
  f.components = new SourceRegistry(f.service, {
    compiler: async (kit, opts) => {
      const b = {
        kit,
        projectVersion: opts.projectVersion,
        javascript: '/* explicit lifecycle unit fixture; not executable React evidence */',
        executionContractHash: 'unit-fixture',
      };
      return { ...b, digest: hash(b) };
    },
  });
  f.chat = new ConversationService(f.service, { components: f.components });
  if (review)
    for (const name of ['customer.get', 'intervention.create']) {
      const c = f.service
        .model(f.who, f.tenant.id, f.project.id)
        .capabilities.find((c) => c.id === name);
      f.service.reviewCapability(f.who, f.tenant.id, f.project.id, name, {
        confirmed: true,
        note: 'Unit fixture capability reviewed',
        risk: c.kind === 'query' ? 'read_only' : 'sensitive',
        confirmation: c.kind === 'query' ? 'none' : 'modal',
        requiredPermissions: c.kind === 'query' ? ['customer.read'] : ['customer.intervene'],
        piiFields: name === 'customer.get' ? ['email'] : [],
        reversible: c.kind === 'query',
        agentEnabled: true,
      });
    }
  return f;
}
export async function kit(name = 'delivery-board') {
  return JSON.parse(
    await readFile(
      new URL('../../examples/source-kits/' + name + '.json', import.meta.url),
      'utf8',
    ),
  );
}
export async function publish(f, name = 'delivery-board') {
  const row = await f.components.import(f.who, f.tenant.id, f.project.id, { kit: await kit(name) });
  const { projectAccess } = await import('../../packages/control-plane/src/access.mjs');
  const s = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const checks = [];
  for (const width of [390, 1280])
    for (const theme of ['light', 'dark'])
      for (const state of ['ready', 'loading', 'empty', 'error'])
        checks.push({
          name: `${state}-${width}-${theme}`,
          passed: true,
          tasks: state === 'ready' ? 1 : 0,
        });
  checks.push({ name: 'ready-1280-light-rtl', passed: true, tasks: 1 });
  const evidence = f.service.store.artifact(s, 'component-evidence', {
    digest: row.digest,
    passed: true,
    checks,
    createdAt: f.service.clock(),
    fixtureOnly: true,
    note: 'Explicit privileged unit-test evidence double. No browser or React execution is claimed.',
  });
  f.db.run(
    'UPDATE component_versions SET evidence_id=? WHERE tenant_id=? AND project_id=? AND id=?',
    evidence.id,
    f.tenant.id,
    f.project.id,
    row.id,
  );
  f.components.approve(f.who, f.tenant.id, f.project.id, row.id, {
    digest: row.digest,
    previewReviewed: true,
    tasksReviewed: true,
    note: 'Unit lifecycle fixture review; not browser acceptance',
  });
  f.components.publish(f.who, f.tenant.id, f.project.id, row.id);
  return row;
}
export function useProvider(f) {
  const p = f.service.createConnection(f.who, f.tenant.id, {
    name: 'Controlled test API',
    kind: 'openai',
    apiKey: 'test-key-not-real',
    model: 'test-fixture',
  });
  const latest = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: latest.revision,
    providerId: p.id,
    modelName: 'test-fixture',
  });
  return p;
}
export function model(value) {
  return () => ({
    generate: async () => ({
      value,
      usage: { inputTokens: 100, outputTokens: 100 },
      provider: 'controlled-fixture',
      model: 'not-a-live-model',
    }),
  });
}
export function hostCredential(f, scopes = ['read', 'run', 'agent']) {
  const t = f.service.createToken(f.who, f.tenant.id, f.project.id, {
    name: 'Host fixture token',
    scopes,
    days: 1,
  });
  const row = f.db.get('SELECT * FROM api_tokens WHERE id=?', t.id);
  return { identity: { userId: f.user.id, token: row }, token: t.token };
}
