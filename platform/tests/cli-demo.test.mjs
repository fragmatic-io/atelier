import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDemoServer } from '../apps/demo/server.mjs';
import { verifySignedBundle } from '../packages/runtime/src/index.mjs';
import { ROOT, tempFixture } from './helpers.mjs';

function cli(args, cwd = ROOT) {
  return spawnSync(process.execPath, [join(ROOT, 'packages/cli/bin/atelier.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function parseOutput(result) {
  assert.equal(result.status, 0, `CLI failed\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('CLI help and doctor work without installation or dependencies', () => {
  const help = cli(['help']);
  assert.equal(help.status, 0);
  assert.ok(help.stdout.includes('Atelier V2'));
  const doctor = parseOutput(cli(['doctor']));
  assert.equal(doctor.ok, true);
  assert.ok(doctor.checks.every((x) => x.pass));
});

test('CLI performs scan → inspect → propose → evaluate → Studio end to end', async (t) => {
  const temp = await tempFixture('atelier-cli-');
  t.after(temp.cleanup);
  const scan = parseOutput(cli(['scan', temp.dir], temp.dir));
  assert.ok(scan.summary.capabilities >= 5);
  await access(join(temp.dir, '.atelier/project-model.json'));
  const inspect = parseOutput(cli(['inspect', temp.dir, 'customer', 'risk'], temp.dir));
  assert.ok(inspect.result.length > 0);
  const proposed = parseOutput(
    cli(
      [
        'propose',
        temp.dir,
        '--slot',
        'customer.detail.right-rail',
        '--goal',
        'Understand this customer and choose the next intervention',
        '--role',
        'support_manager',
        '--permissions',
        'customer.read,customer.intervene,customer.archive',
      ],
      temp.dir,
    ),
  );
  assert.equal(proposed.evaluation.approved, true);
  const evaluated = parseOutput(cli(['evaluate', temp.dir], temp.dir));
  assert.ok(evaluated.reports.every((x) => x.approved));
  const studio = parseOutput(cli(['studio', temp.dir], temp.dir));
  assert.ok(studio.opportunities >= 1);
  assert.ok(
    (await readFile(join(temp.dir, '.atelier/studio/index.html'), 'utf8')).includes(
      'Capability review',
    ),
  );
});

test('CLI Component Forge adds generated source and updates the project model', async (t) => {
  const temp = await tempFixture('atelier-cli-forge-');
  t.after(temp.cleanup);
  parseOutput(cli(['scan', temp.dir], temp.dir));
  const forged = parseOutput(
    cli(
      [
        'forge',
        temp.dir,
        '--name',
        'InterventionEvidenceCockpit',
        '--goal',
        'Create an intervention evidence cockpit',
        '--fields',
        'customer.get.riskScore,customer.get.nextBestAction',
        '--actions',
        'intervention.create',
        '--force',
      ],
      temp.dir,
    ),
  );
  assert.equal(forged.result.kind, 'forged');
  await access(join(temp.dir, 'src/atelier-generated/InterventionEvidenceCockpit.tsx'));
  const model = JSON.parse(await readFile(join(temp.dir, '.atelier/project-model.json'), 'utf8'));
  assert.ok(model.components.some((x) => x.id === 'InterventionEvidenceCockpit'));
  assert.ok(model.searchIndex.documents.some((x) => x.ref === 'InterventionEvidenceCockpit'));
});

test('live demo embeds a signed additive screen and keeps PII out of HTML', async (t) => {
  const demo = await createDemoServer({ port: 0 });
  t.after(demo.close);
  const health = await fetch(`${demo.url}/health`).then((r) => r.json());
  assert.equal(health.ok, true);
  assert.ok(health.evaluation >= 0.9);
  const page = await fetch(`${demo.url}/customers/c_101`).then((r) => r.text());
  assert.ok(page.includes('Additive Atelier extension'));
  assert.ok(page.includes('data-atelier-bundle'));
  assert.ok(page.includes('Aperture Labs'));
  assert.equal(page.includes('ops@aperture.invalid'), false);
  assert.equal(page.includes('[REDACTED]'), false);
  const bundle = await fetch(`${demo.url}/api/atelier/bundle`).then((r) => r.json());
  assert.equal(
    verifySignedBundle(bundle, { [demo.state.keys.keyId]: demo.state.keys.publicKey }),
    true,
  );
});

test('live demo rejects unconfirmed actions and executes confirmed authorized actions', async (t) => {
  const demo = await createDemoServer({ port: 0 });
  t.after(demo.close);
  const input = {
    capabilityId: 'intervention.create',
    customerId: 'c_101',
    input: { customerId: 'c_101', kind: 'call', reason: 'Test' },
  };
  const denied = await fetch(`${demo.url}/api/atelier/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(denied.status, 409);
  const allowed = await fetch(`${demo.url}/api/atelier/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atelier-confirmed': 'true' },
    body: JSON.stringify(input),
  });
  assert.equal(allowed.status, 200);
  const result = await allowed.json();
  assert.equal(result.ok, true);
  assert.equal(result.result.customerId, 'c_101');
  assert.ok(demo.state.runtime.audit.events.some((x) => x.type === 'action.completed'));
});

test('distribution self-audit finds documented packages and the exact compiler dependency set', async () => {
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(ROOT, 'PACKAGE-MANIFEST.json'), 'utf8'));
  assert.equal(
    manifest.files.some((entry) => entry.path.startsWith('.venv/')),
    false,
    'Local browser environments must never enter the source manifest',
  );
  assert.deepEqual(packageJson.dependencies, {
    '@modelcontextprotocol/server': '2.0.0',
    '@types/node': '22.19.17',
    '@types/react': '19.2.0',
    '@types/react-dom': '19.2.0',
    ajv: '8.20.0',
    'ajv-formats': '3.0.1',
    esbuild: '0.28.2',
    postcss: '8.5.28',
    react: '19.2.8',
    'react-dom': '19.2.8',
    redoc: '2.5.0',
    typescript: '5.8.3',
    yaml: '2.9.0',
    zod: '4.5.4',
  });
  const required = [
    'contracts',
    'scanner',
    'project-model',
    'design-genome',
    'agents',
    'component-forge',
    'experience-compiler',
    'runtime',
    'workflow',
    'evaluator',
    'studio',
    'cli',
    'mcp',
    'api-docs',
  ];
  for (const name of required) {
    const files = await readdir(join(ROOT, 'packages', name));
    assert.ok(files.length > 0, `missing package ${name}`);
  }
  await access(join(ROOT, 'docs/ARCHITECTURE.md'));
  await access(join(ROOT, 'SECURITY.md'));
});
