import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { fixture } from './v21/helpers.mjs';
import { DiscoveryService } from '../packages/discovery/src/service.mjs';
import { SurfaceInstallService } from '../packages/surface-install/src/service.mjs';
import { HostedAgentService } from '../packages/surface-install/src/hosted-agent.mjs';
import { createControlServer } from '../packages/control-plane/src/server.mjs';
import { projectAccess } from '../packages/control-plane/src/access.mjs';
import { installSurfaceFields } from '../apps/studio/web/install-surface.mjs';
import { signBundle } from '../packages/runtime/src/index.mjs';

async function modelledFixture() {
  const f = await fixture();
  const discovery = new DiscoveryService(f.service);
  await discovery.importSpec(f.who, f.tenant.id, f.project.id, {
    document: {
      openapi: '3.1.0',
      info: { title: 'Customer API', version: '1' },
      paths: {
        '/accounts': {
          get: { operationId: 'accounts.list', responses: { 200: { description: 'ok' } } },
        },
      },
    },
  });
  const source = discovery.create(f.who, f.tenant.id, f.project.id, {
    name: 'Design observer',
    kind: 'browser',
    allowedOrigins: ['https://app.example'],
    designCapture: true,
  });
  discovery.ingest(source.projectKey, 'https://app.example', {
    heartbeat: true,
    design: {
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
    },
  });
  const observed = discovery.design(f.who, f.tenant.id, f.project.id).observations[0];
  discovery.approveDesign(f.who, f.tenant.id, f.project.id, {
    fingerprint: observed.fingerprint,
  });
  return f;
}

function createInstall(installs, f, overrides = {}) {
  return installs.create(f.who, f.tenant.id, f.project.id, {
    target: 'hosted-script',
    mode: 'route',
    applicationOrigin: 'https://app.example',
    routePath: '/customer/workspace',
    navLabel: 'Workspace',
    slotId: 'workspace.overview',
    environment: 'staging',
    ...overrides,
  });
}

function publishFixture(f, install) {
  const current = f.service.model(f.who, f.tenant.id, f.project.id);
  const capability = current.capabilities[0];
  if (!capability.securityReviewed)
    f.service.reviewCapability(f.who, f.tenant.id, f.project.id, capability.id, {
      title: capability.title,
      description: capability.description,
      risk: 'read_only',
      confirmation: 'none',
      reversible: false,
      requiredPermissions: [],
      piiFields: [],
      approved: true,
      agentEnabled: capability.agentEnabled === true,
    });
  const reviewed = f.service.model(f.who, f.tenant.id, f.project.id);
  const scope = projectAccess(f.db, f.who, f.tenant.id, f.project.id, 'run');
  const artifact = f.service.store.artifact(scope, 'bundle', { fixture: true });
  const releaseId = 'rel_hosted_fixture';
  const unsigned = {
    tenantId: f.tenant.id,
    projectId: f.project.id,
    projectVersion: reviewed.projectVersion,
    slotId: install.bundle.install.slotId,
    environment: install.bundle.install.environment,
    releaseId,
    bundleId: 'bnd_hosted_fixture',
    experiencePlan: {
      queryPlan: [{ capabilityId: capability.id, fields: [] }],
      actionPlan: [],
    },
    presentation: {
      title: 'Customer workspace',
      description: 'Reviewed account context',
      layout: 'focus',
      sections: [
        { title: 'Accounts', source: capability.id, fields: [], variant: 'facts' },
      ],
      actions: [],
    },
  };
  const signingKey = f.db.get(
    'SELECT * FROM signing_keys WHERE tenant_id=? AND project_id=? AND retired_at IS NULL',
    f.tenant.id,
    f.project.id,
  );
  const privateKey = f.box.open(
    signingKey.private_cipher,
    `tenant:${f.tenant.id}:project:${f.project.id}:signing:${signingKey.id}`,
  );
  const signed = signBundle(unsigned, { privateKey, keyId: signingKey.id });
  f.db.run(
    "INSERT INTO releases VALUES(?,?,?,?,?,'staging','published',?,?,?,NULL,?,?,?)",
    f.tenant.id,
    f.project.id,
    releaseId,
    artifact.id,
    install.bundle.install.slotId,
    f.user.id,
    f.user.id,
    Date.now(),
    Date.now(),
    Date.now(),
    JSON.stringify(signed),
  );
  f.db.run(
    'INSERT INTO deployments VALUES(?,?,?,?,?,NULL,1,100,?)',
    f.tenant.id,
    f.project.id,
    install.bundle.install.slotId,
    install.bundle.install.environment,
    releaseId,
    Date.now(),
  );
  return { capability, releaseId };
}

test('hosted installer produces one secret-free script and an approved manifest', async (t) => {
  const f = await modelledFixture();
  t.after(() => f.db.close());
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'https://atelier.example',
  });
  const fields = installSurfaceFields(f.service.model(f.who, f.tenant.id, f.project.id), String);
  assert.match(fields, /name="target" value="hosted-script"/);
  assert.doesNotMatch(fields, /Same-origin bridge path/);
  const result = createInstall(installs, f);
  assert.equal(result.install.status, 'waiting');
  assert.deepEqual(result.bundle.serverSecrets.required, []);
  assert.deepEqual(result.bundle.files, []);
  assert.equal(result.bundle.patches.length, 1);
  assert.match(result.bundle.patches[0].snippet, /embed\/v1\.mjs/);
  assert.match(result.bundle.patches[0].snippet, /data-atelier-install-key="atl_ins_/);
  assert.throws(
    () => installs.publicManifest(result.bundle.publicVerification.key, 'https://app.example'),
    { code: 'SURFACE_NOT_PUBLISHED' },
  );
  const published = publishFixture(f, result);
  const manifest = installs.publicManifest(
    result.bundle.publicVerification.key,
    'https://app.example',
  );
  assert.equal(manifest.bundle.releaseId, published.releaseId);
  assert.deepEqual(manifest.capabilities.map((entry) => entry.id), [published.capability.id]);
  assert.throws(
    () =>
      installs.publicManifest(result.bundle.publicVerification.key, 'https://attacker.example'),
    { code: 'INSTALL_ORIGIN' },
  );
});

test('hosted chatbot is install-bound and executes only reviewed browser reads', async (t) => {
  const f = await modelledFixture();
  t.after(() => f.db.close());
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'https://atelier.example',
  });
  const created = createInstall(installs, f);
  const capability = f.service.model(f.who, f.tenant.id, f.project.id).capabilities[0];
  f.service.reviewCapability(f.who, f.tenant.id, f.project.id, capability.id, {
    title: capability.title,
    description: capability.description,
    risk: 'read_only',
    confirmation: 'none',
    reversible: false,
    requiredPermissions: ['accounts.read'],
    piiFields: [],
    approved: true,
    agentEnabled: true,
  });
  publishFixture(f, created);
  const connection = f.service.createConnection(f.who, f.tenant.id, {
    name: 'Controlled unit provider',
    kind: 'openai',
    apiKey: 'not-a-real-provider-key',
    model: 'unit-model',
  });
  const project = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: project.revision,
    providerId: connection.id,
    modelName: 'unit-model',
  });
  const agents = new HostedAgentService(f.service, installs);
  agents.agents.setup(f.who, f.tenant.id, f.project.id, {
    voice: { name: 'Account guide', tone: 'Clear and concise', locale: 'en' },
    voiceReviewed: true,
    tools: [capability.id],
    clientTools: [capability.id],
    specialists: [],
  });
  const key = created.bundle.publicVerification.key;
  const origin = 'https://app.example';
  const manifest = installs.publicManifest(key, origin);
  assert.equal(manifest.agent.available, true);
  assert.equal(manifest.agent.clientTools[0].operation.path, '/accounts');
  const session = agents.start(key, origin, {
    subject: '128b7253-bd1d-4f37-8bd6-66cb0a20d8f4',
  });
  const thread = agents.rpc(key, origin, session.session, {
    action: 'create',
    input: { title: 'Browser-owned conversation' },
  });
  assert.match(thread.id, /^thread_/);
  assert.deepEqual(
    agents.rpc(key, origin, session.session, { action: 'list' }).map((item) => item.id),
    [thread.id],
  );
  assert.throws(
    () => agents.rpc(key, origin, session.session, { action: 'attach', threadId: thread.id }),
    { code: 'AGENT_OPERATION' },
  );
  assert.throws(
    () => agents.rpc(key, 'https://attacker.example', session.session, { action: 'list' }),
    { code: 'INSTALL_ORIGIN' },
  );
});

test('hosted install fails closed until the design contract is human-approved', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const discovery = new DiscoveryService(f.service);
  await discovery.importSpec(f.who, f.tenant.id, f.project.id, {
    document: {
      openapi: '3.1.0',
      info: { title: 'Customer API', version: '1' },
      paths: { '/accounts': { get: { responses: { 200: { description: 'ok' } } } } },
    },
  });
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'https://atelier.example',
  });
  assert.throws(() => createInstall(installs, f), { code: 'DESIGN_REVIEW_REQUIRED' });
  assert.throws(() => createInstall(installs, f, { target: 'vite-react-fastapi' }), {
    code: 'INVALID_INPUT',
  });
});

test('installation receipts remain origin-bound, bundle-bound, factual and revocable', async (t) => {
  const f = await modelledFixture();
  t.after(() => f.db.close());
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'https://atelier.example',
  });
  const created = createInstall(installs, f);
  const key = created.bundle.publicVerification.key;
  const receipt = {
    installId: created.install.id,
    bundleHash: created.install.bundleHash,
    routeMounted: true,
    bridgeReachable: true,
    authorityConfigured: true,
  };
  assert.throws(() => installs.ingest(key, 'https://attacker.example', receipt), {
    code: 'INSTALL_ORIGIN',
  });
  assert.throws(
    () => installs.ingest(key, 'https://app.example', { ...receipt, bundleHash: 'wrong' }),
    { code: 'INSTALL_BUNDLE_CHANGED' },
  );
  assert.equal(installs.ingest(key, 'https://app.example', receipt).verified, true);
  installs.revoke(f.who, f.tenant.id, f.project.id, created.install.id);
  assert.throws(() => installs.ingest(key, 'https://app.example', receipt), {
    code: 'INSTALL_KEY',
  });
});

test('public receipt endpoint accepts only the configured customer origin', async (t) => {
  const f = await modelledFixture();
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'http://127.0.0.1:4310',
  });
  const created = createInstall(installs, f);
  const control = createControlServer(f.service, { log: () => {} });
  await new Promise((resolve) => control.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await control.close();
    f.db.close();
  });
  const port = control.server.address().port;
  const call = (origin) =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify({
        installId: created.install.id,
        bundleHash: created.install.bundleHash,
        routeMounted: true,
        bridgeReachable: true,
        authorityConfigured: true,
      });
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/install/v1/events',
          method: 'POST',
          headers: {
            Host: '127.0.0.1:4310',
            Origin: origin,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-Atelier-Install-Key': created.bundle.publicVerification.key,
          },
        },
        (response) => {
          let content = '';
          response.on('data', (chunk) => (content += chunk));
          response.on('end', () =>
            resolve({ status: response.statusCode, headers: response.headers, content }),
          );
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  const accepted = await call('https://app.example');
  assert.equal(accepted.status, 202);
  assert.equal(accepted.headers['access-control-allow-origin'], 'https://app.example');
  assert.equal(JSON.parse(accepted.content).verified, true);
  assert.equal((await call('https://attacker.example')).status, 403);
});
