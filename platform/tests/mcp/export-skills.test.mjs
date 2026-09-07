import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const token = `atk_${'s'.repeat(43)}`;

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

test('project skills export is version-bound, secret-free and never overwrites', async (t) => {
  const model = {
    projectId: 'project-export',
    projectVersion: 'version-export-1',
    capabilities: [
      { id: 'customer.get', kind: 'query', securityReviewed: true, confirmation: 'none' },
    ],
    designGenome: { tokens: { primary: '#123456' }, rules: ['Keep tables compact'] },
  };
  const components = [
    {
      id: 'component-published',
      name: 'Published customer card',
      status: 'published',
      digest: 'digest-export',
      project_version: 'version-export-1',
    },
    { id: 'component-draft', name: 'Draft', status: 'draft' },
  ];
  const api = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`)
      return send(res, 401, { error: { code: 'INVALID_TOKEN' } });
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.endsWith('/model')) return send(res, 200, model);
    if (url.pathname.endsWith('/components')) return send(res, 200, components);
    return send(res, 404, { error: { code: 'NOT_FOUND' } });
  });
  await new Promise((resolve, reject) => api.listen(0, '127.0.0.1', resolve).once('error', reject));
  t.after(() => new Promise((resolve) => api.close(resolve)));
  const directory = await mkdtemp(join(tmpdir(), 'atelier-skill-export-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = join(directory, 'mcp.json');
  const output = join(directory, 'skills');
  await writeFile(
    config,
    JSON.stringify({
      origin: `http://127.0.0.1:${api.address().port}`,
      tenantId: 'tenant-export',
      projectId: 'project-export',
      token,
    }),
  );
  await chmod(config, 0o600);
  const result = await exec(
    process.execPath,
    ['scripts/export-project-skills.mjs', '--config', config, '--output', output],
    { cwd: root },
  );
  const report = JSON.parse(result.stdout);
  assert.equal(report.projectVersion, 'version-export-1');
  assert.equal(report.credentialsEmbedded, false);
  const coding = await readFile(join(output, 'atelier-project/SKILL.md'), 'utf8');
  const design = await readFile(join(output, 'atelier-design/SKILL.md'), 'utf8');
  const manifest = await readFile(join(output, 'FILES.sha256'), 'utf8');
  assert.match(coding, /customer\.get/);
  assert.match(coding, /component-published/);
  assert.doesNotMatch(coding, /component-draft/);
  assert.match(design, /#123456/);
  assert.doesNotMatch(`${coding}${design}${manifest}`, new RegExp(token));
  await assert.rejects(
    exec(
      process.execPath,
      ['scripts/export-project-skills.mjs', '--config', config, '--output', output],
      { cwd: root },
    ),
    /Destination already exists/,
  );
});
