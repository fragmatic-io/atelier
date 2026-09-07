import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { fixture } from './v21/helpers.mjs';
import { DiscoveryService } from '../packages/discovery/src/service.mjs';
import { SurfaceInstallService } from '../packages/surface-install/src/service.mjs';
import { createControlServer } from '../packages/control-plane/src/server.mjs';
import { canonical } from '../packages/control-plane/src/util.mjs';
import { installSurfaceFields } from '../apps/studio/web/install-surface.mjs';

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
    target: framework,
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
      if (entry.path.endsWith('.py')) {
        const path = join(directory, entry.path);
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, entry.content);
        const python = process.env.ATELIER_PYTHON ?? join(process.cwd(), '.venv/bin/python');
        const checked = spawnSync(python, ['-m', 'py_compile', path], { encoding: 'utf8' });
        assert.equal(checked.status, 0, `${entry.path}: ${checked.stderr || checked.error}`);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function assertFastApiCanonical(bundle) {
  const entry = bundle.files.find(
    (candidate) => candidate.path === 'backend/app/atelier_integration/canonical.py',
  );
  assert(entry);
  const directory = await mkdtemp(join(tmpdir(), 'atelier-canonical-'));
  try {
    const path = join(directory, 'canonical.py');
    await writeFile(path, entry.content);
    const value = {
      z: [1e-7, 1e-6, 1e20, 1e21, -0, 1.2345678901234567e20],
      a: { unicode: 'Atelier   safe', escaped: '\n"\\' },
    };
    const python = process.env.ATELIER_PYTHON ?? join(process.cwd(), '.venv/bin/python');
    const script =
      'import importlib.util,json,sys; s=importlib.util.spec_from_file_location("canonical",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.canonical_json(json.loads(sys.argv[2])))';
    const checked = spawnSync(python, ['-c', script, path, JSON.stringify(value)], {
      encoding: 'utf8',
    });
    assert.equal(checked.status, 0, checked.stderr || checked.error);
    assert.equal(checked.stdout.trimEnd(), canonical(value));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('target installers generate safe, syntactically valid and secret-free handoff bundles', async (t) => {
  const f = await modelledFixture();
  t.after(() => f.db.close());
  const installs = new SurfaceInstallService(f.service, {
    controlOrigin: 'https://atelier.example',
  });
  const studioFields = installSurfaceFields(f.service.model(f.who, f.tenant.id, f.project.id), String);
  assert.match(studioFields, /name="target"/);
  assert.match(studioFields, /value="vite-react-fastapi">Vite React \+ FastAPI/);

  for (const framework of ['nextjs-app', 'react-router', 'dom', 'vite-react-fastapi']) {
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
    assert.match(content, /authorityConfigured = false|AUTHORITY_CONFIGURED = False/);
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
    if (framework === 'vite-react-fastapi') {
      assert.deepEqual(result.bundle.install.target, {
        id: 'vite-react-fastapi',
        label: 'Vite React + FastAPI',
        clientRuntime: 'react',
        clientLanguage: 'typescript',
        buildTool: 'vite',
        serverFramework: 'fastapi',
      });
      assert(
        result.bundle.files.some(
          (entry) => entry.path === 'frontend/src/atelier/AtelierSurfaceRoute.tsx',
        ),
      );
      assert(
        result.bundle.files.some(
          (entry) => entry.path === 'backend/app/atelier_integration/router.py',
        ),
      );
      assert(!result.bundle.files.some((entry) => entry.path.endsWith('.mjs')));
      const router = result.bundle.files.find(
        (entry) => entry.path === 'backend/app/atelier_integration/router.py',
      );
      const contracts = result.bundle.files.find(
        (entry) => entry.path === 'backend/app/atelier_integration/contracts.py',
      );
      const bridge = result.bundle.files.find(
        (entry) => entry.path === 'backend/app/atelier_integration/bridge.py',
      );
      const ledger = result.bundle.files.find(
        (entry) => entry.path === 'backend/app/atelier_integration/ledger.py',
      );
      assert.match(router.content, /Exact same-origin header required/);
      assert.match(router.content, /100 \* 1024/);
      assert.match(router.content, /environmentConfigured.*authorityConfigured/);
      assert.match(contracts.content, /Ed25519PublicKey/);
      assert.match(contracts.content, /BUNDLE_HASH_MISMATCH/);
      assert.match(contracts.content, /Draft202012Validator/);
      assert.match(contracts.content, /__proto__/);
      assert.match(bridge.content, /HOST_SCOPE/);
      assert.match(bridge.content, /HOST_PERMISSION/);
      assert.match(bridge.content, /authorize_atelier/);
      assert.match(bridge.content, /hmac\.compare_digest/);
      assert.match(ledger.content, /BEGIN IMMEDIATE/);
      assert.match(ledger.content, /ACTION_UNCERTAIN/);
      await assertFastApiCanonical(result.bundle);
    }
  }

  for (const framework of ['nextjs-app', 'react-router', 'dom', 'vite-react-fastapi']) {
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
