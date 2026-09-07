import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserApiClient } from '../packages/embed/src/api-client.mjs';
import { browserInputSchema } from '../packages/conversation/src/inventory.mjs';

const query = {
  id: 'analytics.summary',
  operation: { protocol: 'http', method: 'GET', path: '/api/v1/analytics/{siteId}' },
  inputSchema: {
    type: 'object',
    properties: { siteId: { type: 'string' }, range: { type: 'string' } },
  },
};

test('hosted UI calls only its approved same-origin operation contract', async () => {
  const calls = [];
  const client = createBrowserApiClient([query], {
    origin: 'https://app.example',
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ total: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    csrfToken: () => null,
  });
  const result = await client.load('analytics.summary', { siteId: 'north/a', range: '7d' });
  assert.deepEqual(result, { total: 3 });
  assert.equal(calls[0].url, 'https://app.example/api/v1/analytics/north%2Fa?range=7d');
  assert.equal(calls[0].init.credentials, 'same-origin');
  await assert.rejects(() => client.load('unreviewed.operation', {}), /not in the approved/);
});

test('hosted UI forwards host CSRF only for an approved mutation', async () => {
  let request;
  const client = createBrowserApiClient(
    [
      {
        id: 'finding.review',
        operation: { protocol: 'http', method: 'POST', path: '/api/v1/findings/review' },
        inputSchema: { type: 'object', properties: { findingId: { type: 'string' } } },
      },
    ],
    {
      origin: 'https://app.example',
      csrfToken: () => 'host-csrf',
      fetcher: async (url, init) => {
        request = { url: String(url), init };
        return new Response(null, { status: 204 });
      },
    },
  );
  await client.dispatch('finding.review', { findingId: 'f_1' });
  assert.equal(request.url, 'https://app.example/api/v1/findings/review');
  assert.equal(request.init.headers['X-CSRF-Token'], 'host-csrf');
  assert.equal(request.init.body, '{"findingId":"f_1"}');
});

test('hosted UI never converts credential headers into query or body data', async () => {
  const calls = [];
  const operation = (method) => ({
    id: `operation.${method}`,
    operation: { protocol: 'http', method, path: '/api/v1/items/{itemId}' },
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', 'x-location': 'path' },
        filter: { type: 'string', 'x-location': 'query' },
        note: { type: 'string' },
        'X-API-Key': { type: 'string', 'x-location': 'header' },
        'X-Organization-ID': { type: 'string', 'x-location': 'header' },
      },
    },
  });
  const client = createBrowserApiClient([operation('GET'), operation('POST')], {
    origin: 'https://app.example',
    csrfToken: () => null,
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    },
  });
  const input = {
    itemId: 'item_1',
    filter: 'open',
    note: 'review',
    'X-API-Key': 'must-not-leave',
    'X-Organization-ID': 'must-not-leave',
  };
  await client.load('operation.GET', input);
  await client.dispatch('operation.POST', input);
  assert.equal(calls[0].url, 'https://app.example/api/v1/items/item_1?filter=open&note=review');
  assert.equal(calls[1].url, 'https://app.example/api/v1/items/item_1?filter=open');
  assert.equal(calls[1].init.body, '{"note":"review"}');
  assert.equal(JSON.stringify(calls).includes('must-not-leave'), false);
});

test('browser tool schemas remove credential and tenant headers before model exposure', () => {
  const schema = browserInputSchema({
    type: 'object',
    additionalProperties: false,
    properties: {
      finding_id: { type: 'string', 'x-location': 'path' },
      'X-API-Key': { anyOf: [{ type: 'string' }, { type: 'null' }], 'x-location': 'header' },
      'X-Organization-ID': {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        'x-location': 'header',
      },
    },
    required: ['finding_id', 'X-API-Key'],
  });
  assert.deepEqual(Object.keys(schema.properties), ['finding_id']);
  assert.deepEqual(schema.required, ['finding_id']);
});
