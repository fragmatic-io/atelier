import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostedAgentTransport } from '../packages/embed/src/agent-transport.mjs';

test('hosted agent transport separates the install selector from its short-lived session', async () => {
  const calls = [];
  const storage = new Map();
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/session'))
      return new Response(
        JSON.stringify({ session: 'sealed-session', expiresAt: Date.now() + 3600000 }),
      );
    return new Response(JSON.stringify({ accepted: true }));
  };
  const transport = createHostedAgentTransport('https://atelier.example', 'atl_ins_public', {
    fetcher,
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  assert.deepEqual(await transport({ action: 'list' }), { accepted: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['X-Atelier-Install-Key'], 'atl_ins_public');
  assert.equal(calls[1].options.headers['X-Atelier-Agent-Session'], 'sealed-session');
  assert.equal(calls[1].options.credentials, 'omit');
  assert.equal(JSON.parse(calls[1].options.body).action, 'list');
  assert.deepEqual(await transport({ action: 'list' }), { accepted: true });
  assert.equal(calls.length, 3, 'the unexpired session is reused without another bootstrap');
});

test('hosted artifact previews resolve against Atelier instead of the customer app', async () => {
  const storage = new Map();
  const fetcher = async (url) =>
    new Response(
      JSON.stringify(
        url.endsWith('/session')
          ? { session: 'sealed-session', expiresAt: Date.now() + 3600000 }
          : { preview: { url: '/preview/one-time-grant' } },
      ),
    );
  const transport = createHostedAgentTransport('https://atelier.example', 'atl_ins_public', {
    fetcher,
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  const artifact = await transport({ action: 'artifact', artifactId: 'artifact_1' });
  assert.equal(artifact.preview.url, 'https://atelier.example/preview/one-time-grant');
});
