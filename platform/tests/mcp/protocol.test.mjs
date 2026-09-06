import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = fileURLToPath(new URL('../../', import.meta.url));
const token = `atk_${'a'.repeat(43)}`;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

test('official MCP 2026 client reads only its configured live project and observes revocation', async (t) => {
  let revoked = false;
  const model = {
    projectId: 'project-a',
    projectVersion: 'model-version-a',
    capabilities: [
      { id: 'customer.get', kind: 'query', securityReviewed: true, confirmation: 'none' },
    ],
    designGenome: { tokens: { primary: '#123456' }, rules: ['Use compact tables'] },
  };
  const components = [
    {
      id: 'cmp_pub',
      name: 'Published board',
      status: 'published',
      digest: 'digest-a',
      project_version: 'model-version-a',
    },
    {
      id: 'cmp_draft',
      name: 'Draft board',
      status: 'draft',
      digest: 'digest-b',
      project_version: 'model-version-a',
    },
  ];
  const api = createServer((req, res) => {
    if (revoked || req.headers.authorization !== `Bearer ${token}`)
      return json(res, 401, {
        error: { code: 'INVALID_TOKEN', message: 'Token expired or revoked' },
      });
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/tenants/tenant-a/projects/project-a/'))
      return json(res, 404, { error: { code: 'NOT_FOUND' } });
    if (url.pathname.endsWith('/model')) return json(res, 200, model);
    if (url.pathname.endsWith('/search'))
      return json(res, 200, [
        { id: 'capability:customer.get', score: 1, query: url.searchParams.get('q') },
      ]);
    if (url.pathname.endsWith('/components')) return json(res, 200, components);
    if (url.pathname.endsWith('/components/cmp_pub'))
      return json(res, 200, {
        ...components[0],
        compiled: { kit: { source: 'export default function Board(){}' } },
      });
    if (url.pathname.endsWith('/components/cmp_draft'))
      return json(res, 200, { ...components[1], compiled: {} });
    return json(res, 404, { error: { code: 'NOT_FOUND' } });
  });
  await new Promise((resolve, reject) => api.listen(0, '127.0.0.1', resolve).once('error', reject));
  t.after(() => new Promise((resolve) => api.close(resolve)));
  const directory = await mkdtemp(join(tmpdir(), 'atelier-mcp-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = join(directory, 'mcp.json');
  await writeFile(
    config,
    JSON.stringify({
      origin: `http://127.0.0.1:${api.address().port}`,
      tenantId: 'tenant-a',
      projectId: 'project-a',
      token,
    }),
  );
  await chmod(config, 0o600);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['scripts/mcp.mjs', '--config', config],
    cwd: root,
    stderr: 'pipe',
  });
  const client = new Client(
    { name: 'atelier-release-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(transport);
  t.after(() => client.close());

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((item) => item.name).sort(), [
    'atelier_get_component_source',
    'atelier_get_project_model',
    'atelier_list_components',
    'atelier_search_project',
  ]);
  const listed = await client.callTool({ name: 'atelier_list_components', arguments: {} });
  assert.deepEqual(
    listed.structuredContent.result.map((item) => item.id),
    ['cmp_pub'],
  );
  const source = await client.callTool({
    name: 'atelier_get_component_source',
    arguments: { componentId: 'cmp_pub' },
  });
  assert.match(source.content[0].text, /export default function Board/);
  const draft = await client.callTool({
    name: 'atelier_get_component_source',
    arguments: { componentId: 'cmp_draft' },
  });
  assert.equal(draft.isError, true);
  const skill = await client.readResource({ uri: 'atelier://project/skill/coding' });
  assert.match(skill.contents[0].text, /model-version-a/);
  assert.doesNotMatch(skill.contents[0].text, /cmp_draft/);

  revoked = true;
  const denied = await client.callTool({ name: 'atelier_get_project_model', arguments: {} });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /INVALID_TOKEN/);
});
