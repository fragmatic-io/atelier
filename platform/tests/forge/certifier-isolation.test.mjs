import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileSourceKit } from '../../packages/source-forge/src/compiler.mjs';
import {
  certifySourceKit,
  playwrightBrowserCache,
} from '../../packages/source-forge/src/certifier.mjs';

test('local certifier keeps the installed browser cache while isolating HOME', () => {
  assert.equal(
    playwrightBrowserCache({ platform: 'darwin', home: '/Users/example' }),
    '/Users/example/Library/Caches/ms-playwright',
  );
  assert.equal(
    playwrightBrowserCache({ platform: 'linux', home: '/home/example' }),
    '/home/example/.cache/ms-playwright',
  );
});

test('production source certification refuses the local browser process', async () => {
  const kit = JSON.parse(
    await readFile(
      new URL('../../examples/source-kits/delivery-board.json', import.meta.url),
      'utf8',
    ),
  );
  const compiled = await compileSourceKit(kit, {
    projectVersion: 'isolation-test',
    approvedActions: kit.actions,
  });
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(certifySourceKit(compiled, { mode: 'local' }), {
      code: 'ISOLATED_CERTIFIER_REQUIRED',
    });
  } finally {
    if (prior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prior;
  }
});

test('certifier image pins matching Playwright browser and Python runtimes', async () => {
  const dockerfile = await readFile(
    new URL('../../ops/certifier.Dockerfile', import.meta.url),
    'utf8',
  );
  assert.match(dockerfile, /^FROM mcr\.microsoft\.com\/playwright\/python:v1\.62\.0-noble/m);
  assert.match(dockerfile, /^RUN pip install --no-cache-dir playwright==1\.62\.0$/m);
  assert.match(dockerfile, /^USER pwuser$/m);
});

test('application image installs production dependencies inside Linux', async () => {
  const dockerfile = await readFile(new URL('../../ops/Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /^COPY package\.json package-lock\.json \.\/$/m);
  assert.match(dockerfile, /^RUN npm ci --omit=dev --no-audit --no-fund$/m);
});
