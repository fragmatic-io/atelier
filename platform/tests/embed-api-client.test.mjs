import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserApiClient } from '../packages/embed/src/api-client.mjs';

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
