import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { fixture } from './v21/helpers.mjs';
import { DiscoveryService } from '../packages/discovery/src/service.mjs';
import { SurfaceInstallService } from '../packages/surface-install/src/service.mjs';
import { createControlServer } from '../packages/control-plane/src/server.mjs';

async function modelledFixture() {
  const f = await fixture();
  const discovery = new DiscoveryService(f.service);
  await discovery.importSpec(f.who, f.tenant.id, f.project.id, {
    document: {
      openapi: '3.1.0',
      info: { title: 'Customer API', version: '1' },
      paths: {
        '/accounts': {
          get: {
            operationId: 'accounts.list',
            responses: { 200: { description: 'ok' } },
          },
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
      input: { borderRadius: '8px', height: '36px' },
    },
  };
  discovery.ingest(source.projectKey, 'https://app.example', {
    heartbeat: true,
    design: contract,
  });
  const observed = discovery.design(f.who, f.tenant.id, f.project.id).observations[0];
  discovery.approveDesign(f.who, f.tenant.id, f.project.id, {
    fingerprint: observed.fingerprint,
  });
  return f;
}

function createInstall(installs, f, framework, overrides = {}) {
  return installs.create(f.who, f.tenant.id, f.project.id, {
    framework,
    mode: 'route',
    applicationOrigin: 'https://app.example',
    routePath: '/customer/workspace',
    navLabel: `Workspace <${framework}> & "safe"`,
    bridgePath: '/internal/atelier',
    slotId: 'workspace.overview',
    environment: 'staging',
    ...overrides,
  });
}

async function assertGeneratedSyntax(bundle) {
  const directory = await mkdtemp(join(tmpdir(), 'atelier-install-'));
  try {
    for (const entry of bundle.files) {
      if (entry.path.endsWith('.mjs')) {
        const path = join(directory, entry.path.replaceAll('/', '-'));
        await writeFile(path, entry.content);
        const checked = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
        assert.equal(checked.status, 0, `${entry.path}: ${checked.stderr}`);
      }
      if (entry.path.endsWith('.ts') || entry.path.endsWith('.tsx')) {
        const result = ts.transpileModule(entry.content, {
          fileName: entry.path,
          reportDiagnostics: true,
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        });
        const errors = (result.diagnostics ?? []).filter(
          (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
        );
        assert.deepEqual(
          errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
          [],
          entry.path,
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('framework installers generate safe, syntactically valid and secret-free handoff bundles', async (t) => {
  const f = await modelledFixture();
  t.after(() => f.db.close());
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'https://atelier.example',
  });

  for (const framework of ['nextjs-app', 'react-router', 'dom']) {
    const result = createInstall(installs, f, framework);
    assert.equal(result.install.status, 'waiting');
    assert.equal(result.bundle.publicVerification.originBound, 'https://app.example');
    assert.match(result.bundle.publicVerification.key, /^atl_ins_/);
    assert.equal(result.bundle.serverSecrets.committed, false);
    assert.deepEqual(result.bundle.verification.requiredFacts, [
      'routeMounted',
      'bridgeReachable',
      'authorityConfigured',
      'designContractBound',
    ]);
    assert.equal(result.install.facts.designContractBound, true);
    assert.equal(result.bundle.install.designFingerprint.length, 64);
    const designCss = result.bundle.files.find((entry) =>
      entry.path.endsWith('atelier-design.css'),
    );
    assert(designCss);
    assert.match(designCss.content, /font-family: Inter, sans-serif/);
    assert.match(designCss.content, new RegExp(result.bundle.install.designFingerprint));
    const content = JSON.stringify(result.bundle.files);
    assert(!content.includes(result.bundle.publicVerification.key.replace('atl_ins_', 'atl_pat_')));
    assert(!content.includes('ATELIER_HOST_TOKEN=atl_'));
    assert.match(content, /authorityConfigured = false/);
    assert(!content.includes('<script>'));
    await assertGeneratedSyntax(result.bundle);

    if (framework === 'nextjs-app') {
      assert(result.bundle.files.some((entry) => entry.path === 'app/customer/workspace/page.tsx'));
      const handler = result.bundle.files.find(
        (entry) => entry.path === 'app/internal/atelier/[operation]/route.ts',
      );
      assert(handler);
      assert.match(handler.content, /\.\.\/\.\.\/\.\.\/\.\.\/lib\/atelier\/server/);
      assert.match(handler.content, /Exact same-origin header required/);
      assert.match(handler.content, /100 \* 1024/);
      assert.match(handler.content, /__proto__/);
      const page = result.bundle.files.find(
        (entry) => entry.path === 'app/customer/workspace/page.tsx',
      );
      assert.match(page.content, /\.\.\/\.\.\/\.\.\/components\/atelier/);
    }
  }

  for (const framework of ['nextjs-app', 'react-router', 'dom']) {
    const embedded = createInstall(installs, f, framework, {
      mode: framework === 'react-router' ? 'drawer' : 'inline',
      routePath: '/existing/customer',
    }).bundle;
    assert(
      embedded.patches.some(
        (entry) => entry.target.includes('existing') && entry.purpose.includes('without replacing'),
      ),
    );
    assert(!embedded.files.some((entry) => /NavLink|SurfaceRoute|page\.tsx/.test(entry.path)));
    if (framework === 'dom')
      assert(!embedded.files.some((entry) => entry.path === 'public/atelier-surface.html'));
    await assertGeneratedSyntax(embedded);
  }

  assert.throws(() => createInstall(installs, f, 'nextjs-app', { routePath: '/unsafe/../route' }), {
    code: 'INSTALL_PATH',
  });
  assert.throws(
    () => createInstall(installs, f, 'nextjs-app', { bridgePath: '/api/atelier?token=x' }),
    { code: 'INSTALL_PATH' },
  );
});

test('surface installers fail closed until a host design contract is human-approved', async (t) => {
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
  assert.throws(() => createInstall(installs, f, 'nextjs-app'), {
    code: 'DESIGN_REVIEW_REQUIRED',
  });
});

test('installation receipts are origin-bound, bundle-bound, factual and revocable', async (t) => {
  const f = await modelledFixture();
  t.after(() => f.db.close());
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'https://atelier.example',
  });
  const created = createInstall(installs, f, 'nextjs-app');
  const key = created.bundle.publicVerification.key;
  const receipt = {
    installId: created.install.id,
    bundleHash: created.install.bundleHash,
    routeMounted: true,
    bridgeReachable: false,
    authorityConfigured: false,
  };
  assert.throws(() => installs.ingest(key, 'https://attacker.example', receipt), {
    code: 'INSTALL_ORIGIN',
  });
  assert.throws(
    () => installs.ingest(key, 'https://app.example', { ...receipt, bundleHash: 'wrong' }),
    { code: 'INSTALL_BUNDLE_CHANGED' },
  );
  const partial = installs.ingest(key, 'https://app.example', receipt);
  assert.equal(partial.verified, false);
  assert.equal(installs.list(f.who, f.tenant.id, f.project.id)[0].status, 'partial');
  const complete = installs.ingest(key, 'https://app.example', {
    ...receipt,
    bridgeReachable: true,
    authorityConfigured: true,
  });
  assert.equal(complete.verified, true);
  const status = new DiscoveryService(f.service).status(f.who, f.tenant.id, f.project.id);
  assert.equal(status.facts.verifiedInstalls, 1);
  assert.equal(status.installs[0].status, 'verified');
  installs.revoke(f.who, f.tenant.id, f.project.id, created.install.id);
  assert.throws(() => installs.ingest(key, 'https://app.example', receipt), {
    code: 'INSTALL_KEY',
  });
});

test('public install verification endpoint accepts only the configured customer origin', async (t) => {
  const f = await modelledFixture();
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'http://127.0.0.1:4310',
  });
  const created = createInstall(installs, f, 'dom');
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
  const denied = await call('https://attacker.example');
  assert.equal(denied.status, 403);
});
