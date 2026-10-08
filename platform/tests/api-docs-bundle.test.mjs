import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Script } from 'node:vm';
import { buildApiDocsRenderer, getApiDocsRenderer } from '../packages/api-docs/src/renderer.mjs';

const require = createRequire(import.meta.url);

test('API reference bundles the actual patched dependencies and keeps their notices', async () => {
  const asset = await getApiDocsRenderer();
  const redocPackage = require.resolve('redoc/package.json');
  const fromRedoc = createRequire(redocPackage);
  const dompurify = JSON.parse(await readFile(join(dirname(fromRedoc.resolve('dompurify')), '../package.json'), 'utf8'));
  const yaml = createRequire(fromRedoc.resolve('@redocly/openapi-core/package.json'))('js-yaml/package.json');
  assert.equal(asset.evidence.dependencies.dompurify, dompurify.version);
  assert.equal(asset.evidence.dependencies['js-yaml'], yaml.version);
  assert.match(asset.javascript.slice(0, 200), /Atelier Redoc/);
  assert.ok(asset.javascript.includes(`.version="${dompurify.version}"`));
  assert.doesNotMatch(asset.javascript, /\.version\s*=\s*["']3\.2\.4["']/);
  assert.ok(asset.evidence.inputs.some((file) => file.endsWith('redoc/bundles/redoc.browser.lib.js')));
  assert.ok(asset.evidence.inputs.some((file) => file.includes('dompurify/dist/purify.cjs.js')));
  assert.ok(asset.evidence.inputs.some((file) => file.endsWith('js-yaml/index.js')));
  assert.ok(asset.evidence.inputs.every((file) => !file.endsWith('redoc.standalone.js')));
  assert.match(asset.licenses, /Rebilly, Inc/);
  assert.match(asset.licenses, /DOMPurify/);
  assert.match(asset.licenses, /Permission is hereby granted/);
  assert.equal(createHash('sha256').update(asset.javascript).digest('hex'), asset.evidence.javascriptSha256);
  assert.equal(createHash('sha256').update(asset.licenses).digest('hex'), asset.evidence.licensesSha256);
  new Script(asset.javascript); // Parse the output; this does not claim browser execution.
});

test('concurrent API reference requests share one immutable build and rebuilds are deterministic', async () => {
  const first = getApiDocsRenderer(), second = getApiDocsRenderer();
  assert.equal(first, second);
  const asset = await first;
  assert.equal(asset, await getApiDocsRenderer());
  assert.ok(Object.isFrozen(asset));
  assert.ok(Object.isFrozen(asset.evidence));
  const rebuilt = await buildApiDocsRenderer();
  assert.equal(rebuilt.javascript, asset.javascript);
  assert.equal(rebuilt.licenses, asset.licenses);
  assert.deepEqual(rebuilt.evidence, asset.evidence);
});
