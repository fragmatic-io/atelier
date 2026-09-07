import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fixture } from './v21/helpers.mjs';
import { DiscoveryService } from '../packages/discovery/src/service.mjs';
import { sanitizeSemanticSample } from '../packages/discovery/src/contracts.mjs';
import { sha256 } from '../packages/contracts/src/index.mjs';
import { createControlServer } from '../packages/control-plane/src/server.mjs';

function observation(overrides = {}) {
  const event = {
    method: 'GET',
    path: '/api/findings/{id}',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: {
      type: 'object',
      properties: { email: { type: 'string' }, status: { type: 'string' } },
      additionalProperties: false,
    },
    status: 200,
    environment: 'production',
    userRole: 'reviewer',
    pagePath: '/findings',
    ...overrides,
  };
  event.fingerprint = sha256({
    method: event.method,
    path: event.path,
    inputSchema: event.inputSchema,
    outputSchema: event.outputSchema,
  });
  return event;
}

test('semantic samples are locally projectable and never preserve PII, free text, ids or exact numbers', () => {
  const projected = sanitizeSemanticSample(
    {
      email: 'person@example.test',
      status: 'at_risk',
      note: 'Customer shared a private explanation',
      accountId: '9f627994-1077-4ac2-912e-cf122f2cc241',
      score: 847,
      password: 'never',
    },
    { safeValueFields: ['status'] },
  );
  assert.deepEqual(projected, {
    email: '<redacted:pii>',
    status: 'at_risk',
    note: '<string:medium>',
    accountId: '<redacted:pii>',
    score: '<number:100-1000>',
  });
  assert(!JSON.stringify(projected).includes('private explanation'));
  assert(!JSON.stringify(projected).includes('never'));
});

test('browser discovery is origin-bound, server-deduplicated and builds a review-required model', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const discovery = new DiscoveryService(f.service);
  const source = discovery.create(f.who, f.tenant.id, f.project.id, {
    kind: 'browser',
    allowedOrigins: ['https://sitewatch.example'],
    semanticSamples: true,
    safeSampleFields: ['status'],
  });
  const event = observation({
    sample: { output: { email: 'private@example.test', status: 'open' } },
  });
  assert.throws(
    () => discovery.ingest(source.projectKey, 'https://attacker.example', { events: [event] }),
    { code: 'OBSERVER_ORIGIN' },
  );
  const first = discovery.ingest(source.projectKey, 'https://sitewatch.example', {
    events: [event],
  });
  assert.equal(first.newRevisions, 1);
  assert.equal(first.newContexts, 1);
  const replay = discovery.ingest(source.projectKey, 'https://sitewatch.example', {
    events: [event],
  });
  assert.equal(replay.newRevisions, 0);
  assert.equal(replay.newContexts, 0);
  const newRole = discovery.ingest(source.projectKey, 'https://sitewatch.example', {
    events: [{ ...event, userRole: 'manager' }],
  });
  assert.equal(newRole.newRevisions, 0);
  assert.equal(newRole.newContexts, 1);
  const model = f.service.model(f.who, f.tenant.id, f.project.id);
  assert.equal(model.sourceSummary.mode, 'metadata-only');
  assert.equal(model.sourceSummary.filesScanned, 0);
  assert.equal(model.capabilities.length, 1);
  assert.equal(model.capabilities[0].securityReviewed, false);
  assert.equal(model.capabilities[0].agentEnabled, false);
  assert.equal(model.capabilities[0].title, 'Read findings');
  assert.match(model.capabilities[0].description, /response shape includes status/i);
  assert.deepEqual(model.capabilities[0].redactedSamples[0].output, {
    email: '<redacted:pii>',
    status: 'open',
  });
  assert.deepEqual(
    model.capabilities[0].observedContexts.map((context) => context.userRole).sort(),
    ['manager', 'reviewer'],
  );
  const status = discovery.status(f.who, f.tenant.id, f.project.id);
  assert.equal(status.state, 'action_required');
  assert.equal(status.nextStep, 'review');
  assert.equal(status.facts.observations, 1);
});

test('samples fail closed unless the human enabled them on the discovery source', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const discovery = new DiscoveryService(f.service);
  const source = discovery.create(f.who, f.tenant.id, f.project.id, {
    kind: 'browser',
    allowedOrigins: ['https://app.example'],
  });
  assert.throws(
    () =>
      discovery.ingest(source.projectKey, 'https://app.example', {
        events: [observation({ sample: { output: { status: 'open' } } })],
      }),
    { code: 'SAMPLES_DISABLED' },
  );
});

test('design capture sends computed styles only and requires explicit human approval', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const discovery = new DiscoveryService(f.service);
  const disabled = discovery.create(f.who, f.tenant.id, f.project.id, {
    kind: 'browser',
    allowedOrigins: ['https://app.example'],
  });
  const contract = {
    version: 1,
    viewport: { bucket: 'desktop', colorScheme: 'light' },
    roles: {
      root: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        color: 'rgb(20, 24, 31)',
        backgroundColor: 'rgb(255, 255, 255)',
      },
      button: { borderRadius: '8px', height: '36px' },
    },
  };
  assert.throws(
    () =>
      discovery.ingest(disabled.projectKey, 'https://app.example', {
        heartbeat: true,
        design: contract,
      }),
    { code: 'DESIGN_CAPTURE_DISABLED' },
  );
  const source = discovery.create(f.who, f.tenant.id, f.project.id, {
    kind: 'browser',
    allowedOrigins: ['https://app.example'],
    designCapture: true,
  });
  assert.throws(
    () =>
      discovery.ingest(source.projectKey, 'https://app.example', {
        heartbeat: true,
        design: {
          ...contract,
          roles: { root: { ...contract.roles.root, backgroundColor: 'url(secret)' } },
        },
      }),
    { code: 'DESIGN_VALUE' },
  );
  discovery.ingest(source.projectKey, 'https://app.example', {
    heartbeat: true,
    design: contract,
  });
  let design = discovery.design(f.who, f.tenant.id, f.project.id);
  assert.equal(design.observations.length, 1);
  assert.equal(design.approved, null);
  const approved = discovery.approveDesign(f.who, f.tenant.id, f.project.id, {
    fingerprint: design.observations[0].fingerprint,
    overrides: { roles: { button: { borderRadius: '10px' } } },
  });
  assert.equal(approved.contract.roles.button.borderRadius, '10px');
  design = discovery.design(f.who, f.tenant.id, f.project.id);
  assert.equal(design.approved.fingerprint, approved.fingerprint);
  assert.equal(discovery.status(f.who, f.tenant.id, f.project.id).facts.designApproved, true);
  assert(!JSON.stringify(design).includes('secret'));
});

test('OpenAPI is explicit declared evidence and private URL targets are rejected', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const discovery = new DiscoveryService(f.service);
  const imported = await discovery.importSpec(f.who, f.tenant.id, f.project.id, {
    sourceName: 'production.openapi.json',
    document: {
      openapi: '3.1.0',
      info: { title: 'Example', version: '1' },
      paths: {
        '/analytics': {
          get: {
            operationId: 'analytics.summary',
            summary: 'Read analytics',
            responses: { 200: { description: 'ok' } },
          },
        },
      },
    },
  });
  assert.equal(imported.operations, 1);
  const capability = f.service.model(f.who, f.tenant.id, f.project.id).capabilities[0];
  assert.equal(capability.id, 'analytics.summary');
  assert.equal(capability.recommendation.review, 'approve_after_auth_check');
  await assert.rejects(
    discovery.importSpec(f.who, f.tenant.id, f.project.id, {
      sourceUrl: 'https://127.0.0.1/openapi.json',
    }),
    { code: 'SPEC_IP_DENIED' },
  );
});

test('security approval and chatbot exposure are separate human decisions', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const discovery = new DiscoveryService(f.service);
  await discovery.importSpec(f.who, f.tenant.id, f.project.id, {
    document: {
      openapi: '3.1.0',
      info: { title: 'Example', version: '1' },
      paths: {
        '/analytics': {
          get: { operationId: 'analytics.summary', responses: { 200: { description: 'ok' } } },
        },
      },
    },
  });
  const base = {
    title: 'Analytics summary',
    description: 'Read the tenant analytics summary',
    risk: 'read_only',
    confirmation: 'none',
    reversible: true,
    requiredPermissions: ['analytics.read'],
    piiFields: [],
  };
  f.service.reviewCapability(f.who, f.tenant.id, f.project.id, 'analytics.summary', {
    ...base,
    approved: true,
    agentEnabled: false,
  });
  let capability = f.service.model(f.who, f.tenant.id, f.project.id).capabilities[0];
  assert.equal(capability.securityReviewed, true);
  assert.equal(capability.agentEnabled, false);
  f.service.reviewCapability(f.who, f.tenant.id, f.project.id, 'analytics.summary', {
    ...base,
    approved: true,
    agentEnabled: true,
  });
  capability = f.service.model(f.who, f.tenant.id, f.project.id).capabilities[0];
  assert.equal(capability.agentEnabled, true);
});

test('public observer endpoint enforces CORS origin and serves the standalone snippet', async (t) => {
  const f = await fixture();
  const discovery = new DiscoveryService(f.service);
  const source = discovery.create(f.who, f.tenant.id, f.project.id, {
    kind: 'browser',
    allowedOrigins: ['https://app.example'],
  });
  const control = createControlServer(f.service, { log: () => {} });
  await new Promise((resolve) => control.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await control.close();
    f.db.close();
  });
  const port = control.server.address().port;
  const call = (path, method = 'GET', body, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            Host: '127.0.0.1:4310',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
          },
        },
        (res) => {
          let content = '';
          res.on('data', (chunk) => (content += chunk));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, content }));
        },
      );
      req.on('error', reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
  const script = await call('/observe/v1.js');
  assert.equal(script.status, 200);
  assert.match(script.content, /AtelierObserver/);
  const accepted = await call(
    '/api/observe/v1/events',
    'POST',
    { heartbeat: true },
    { Origin: 'https://app.example', 'X-Atelier-Project-Key': source.projectKey },
  );
  assert.equal(accepted.status, 202);
  assert.equal(accepted.headers['access-control-allow-origin'], 'https://app.example');
  const denied = await call(
    '/api/observe/v1/events',
    'POST',
    { heartbeat: true },
    { Origin: 'https://attacker.example', 'X-Atelier-Project-Key': source.projectKey },
  );
  assert.equal(denied.status, 403);
});

test('Studio exposes guided setup, snippet privacy and fact-derived status copy', async () => {
  const [app, onboarding, installer, styles, observer] = await Promise.all([
    readFile(new URL('../apps/studio/web/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../apps/studio/web/onboarding.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../apps/studio/web/install-surface.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../apps/studio/web/onboarding.css', import.meta.url), 'utf8'),
    readFile(new URL('../packages/discovery/src/observer.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /connect-observer/);
  assert.match(app, /configure-agent/);
  assert.match(app, /approve-design/);
  assert.match(onboarding, /Every status below comes from stored evidence/);
  assert.match(onboarding, /Custom surfaces and chatbot tools share one inventory/);
  assert.match(onboarding, /Markup renders inside the customer app/);
  assert.match(onboarding, /never arbitrary model-written HTML/);
  assert.match(onboarding, /observer never injects links or UI/);
  assert.match(onboarding, /new route, mount into an existing page, or improve/);
  assert.match(
    onboarding,
    /Discovered, approved, chatbot enabled and published are separate states/,
  );
  assert.match(installer, /Generated, not injected/);
  assert.match(installer, /Copy coding-agent prompt/);
  assert.match(installer, /factual installation receipt/);
  assert.match(styles, /\.setup-rail/);
  assert.match(observer, /XMLHttpRequest\.prototype\.send/);
  assert.match(observer, /atelier:observation-preview/);
  assert.match(observer, /atelier:design-preview/);
  assert.match(observer, /data-atelier-design-root/);
  assert.match(observer, /piiPath\.test\(decoded\)/);
});
