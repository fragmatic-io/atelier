import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlServer } from '../../packages/control-plane/src/server.mjs';
import { SourceRegistry } from '../../packages/source-forge/src/registry.mjs';
import { hostCredential, publish, ready } from './helpers.mjs';

test('component HTTP routes use the normalized server contract and token scope', async (t) => {
  const fixture = await ready();
  t.after(() => fixture.db.close());
  fixture.components = new SourceRegistry(fixture.service);
  const published = await publish(fixture);
  const credential = hostCredential(fixture, ['read']);
  const control = createControlServer(fixture.service, {
    origin: 'http://127.0.0.1:4317',
    log: () => {},
  });
  await new Promise((resolve, reject) =>
    control.server.listen(4317, '127.0.0.1', resolve).once('error', reject),
  );
  t.after(() => control.close());
  const headers = { Authorization: `Bearer ${credential.token}` };
  const base = `http://127.0.0.1:4317/api/tenants/${fixture.tenant.id}/projects/${fixture.project.id}`;

  const listResponse = await fetch(`${base}/components`, { headers });
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json())[0].id, published.id);

  const componentResponse = await fetch(`${base}/components/${published.id}`, { headers });
  assert.equal(componentResponse.status, 200);
  const component = await componentResponse.json();
  assert.equal(component.status, 'published');
  assert.equal(component.compiled.digest, published.digest);

  const previewResponse = await fetch(`${base}/components/${published.id}/preview`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'published', frameOrigin: 'http://127.0.0.1:4318' }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  const frameResponse = await fetch(`http://127.0.0.1:4317${preview.url}`);
  const frameHtml = await frameResponse.text();
  assert.equal(frameResponse.status, 200, frameHtml);
  assert.equal(frameResponse.headers.get('x-frame-options'), null);
  assert.match(frameResponse.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(
    frameResponse.headers.get('content-security-policy'),
    /frame-ancestors http:\/\/127\.0\.0\.1:4318/,
  );
  assert.match(frameHtml, /^<!doctype html>/);
});
