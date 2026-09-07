import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createOpenApiDocument } from '../packages/api-docs/src/openapi.mjs';
import { createControlServer } from '../packages/control-plane/src/server.mjs';
import { fixture, password, scanned } from './v21/helpers.mjs';

test('project model exports deterministic OpenAPI 3.1 operations and review metadata', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const project = f.service.project(f.who, f.tenant.id, f.project.id);
  const model = f.service.model(f.who, f.tenant.id, f.project.id);
  const spec = createOpenApiDocument({ project, model });
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.info.version, model.projectVersion);
  const get = spec.paths['/api/customers/{customerId}'].get;
  assert.equal(get.operationId, 'customer.get');
  assert.equal(get.parameters[0].in, 'path');
  assert.equal(get['x-atelier-security-reviewed'], false);
  const create = spec.paths['/api/customers/{customerId}/interventions'].post;
  assert.equal(create.requestBody.required, true);
  assert.deepEqual(Object.keys(create.requestBody.content['application/json'].schema.properties), [
    'kind',
    'reason',
  ]);
  assert.equal(JSON.stringify(spec).includes('x-location'), false);
  assert.deepEqual(spec, createOpenApiDocument({ project, model }));
  f.service.reviewCapability(f.who, f.tenant.id, f.project.id, 'customer.get', {
    risk: 'read_only',
    confirmation: 'none',
    reversible: true,
    requiredPermissions: ['customer.read'],
    piiFields: ['email'],
  });
  const reviewed = createOpenApiDocument({
    project: f.service.project(f.who, f.tenant.id, f.project.id),
    model: f.service.model(f.who, f.tenant.id, f.project.id),
  });
  assert.equal(
    reviewed.paths['/api/customers/{customerId}'].get['x-atelier-security-reviewed'],
    true,
  );
});

test('OpenAPI endpoint is authenticated, project-scoped and Redoc assets are local', async (t) => {
  const f = await fixture();
  await scanned(f);
  const control = createControlServer(f.service, {
    origin: 'http://127.0.0.1:4310',
    log: () => {},
  });
  await new Promise((resolve, reject) =>
    control.server.listen(0, '127.0.0.1', resolve).once('error', reject),
  );
  t.after(async () => {
    await control.close();
    f.db.close();
  });
  const port = control.server.address().port;
  const call = (path, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          headers: { Host: '127.0.0.1:4310', ...headers },
        },
        (res) => {
          let text = '';
          res.on('data', (chunk) => (text += chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              json: () => JSON.parse(text),
              text: () => text,
            }),
          );
        },
      );
      req.on('error', reject);
      req.end();
    });
  const endpoint = `/api/tenants/${f.tenant.id}/projects/${f.project.id}/openapi`;
  assert.equal((await call(endpoint)).status, 401);
  const login = await f.auth.login({ email: 'builder@example.test', password });
  const headers = { Cookie: `atelier_session=${login.session}` };
  const response = await call(endpoint, headers);
  assert.equal(response.status, 200);
  assert.equal(response.json()['x-atelier-project-id'], f.project.id);
  const page = await call(`/api-reference/${f.tenant.id}/${f.project.id}`, headers);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /style-src 'self' 'unsafe-inline'/);
  assert.match(page.text(), /redoc\.standalone\.js/);
  const asset = await call('/assets/redoc.standalone.js');
  assert.equal(asset.status, 200);
  assert.match(asset.headers['content-type'], /javascript/);
  const body = asset.text();
  assert.match(body.slice(0, 2000), /Redoc|webpack/);
});
