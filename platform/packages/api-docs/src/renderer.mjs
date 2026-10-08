// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = fileURLToPath(new URL('./renderer-entry.mjs', import.meta.url));
const require = createRequire(import.meta.url);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const localPath = (value) => relative(root, value).replaceAll('\\', '/');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

async function packageFor(entryPath, expectedName) {
  let directory = dirname(entryPath);
  for (;;) {
    try {
      const file = join(directory, 'package.json');
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (value.name !== expectedName)
        fail('API_DOCS_DEPENDENCY', `Unexpected installed ${expectedName} package`);
      return { ...value, directory, file };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) fail('API_DOCS_DEPENDENCY', `Missing installed ${expectedName} metadata`);
    directory = parent;
  }
}

function patchedVersion(name, value, minimum) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value))
    fail('API_DOCS_DEPENDENCY_VERSION', `Use a stable, reviewed ${name} version`);
  const actual = value.split('.').map(Number), required = minimum.split('.').map(Number);
  const difference = actual.map((part, index) => part - required[index]).find((part) => part !== 0) ?? 0;
  if (difference < 0)
    fail('API_DOCS_DEPENDENCY_VERSION', `The API reference requires ${name} ${minimum} or later`);
}

/** Build only from installed local modules. Deployment uses npm ci; downstream
 * package consumers own their lockfile, so check the actual resolved packages.
 * Never serve upstream standalone bundles with hidden, stale dependencies. */
export async function buildApiDocsRenderer() {
  const redoc = await packageFor(require.resolve('redoc'), 'redoc');
  if (redoc.browser !== 'bundles/redoc.browser.lib.js')
    fail('API_DOCS_RENDERER_ENTRY', 'Review the Redoc browser library entry before upgrading');
  const fromRedoc = createRequire(redoc.file);
  const sanitizerEntry = fromRedoc.resolve('dompurify');
  const sanitizer = await packageFor(sanitizerEntry, 'dompurify');
  const core = await packageFor(fromRedoc.resolve('@redocly/openapi-core'), '@redocly/openapi-core');
  const yamlEntry = createRequire(core.file).resolve('js-yaml');
  const yaml = await packageFor(yamlEntry, 'js-yaml');
  patchedVersion('DOMPurify', sanitizer.version, '3.4.16');
  patchedVersion('js-yaml', yaml.version, '4.3.2');

  const built = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile: 'atelier-redoc.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
    minify: true,
    metafile: true,
    sourcemap: false,
    legalComments: 'external',
    logLevel: 'silent',
    banner: { js: '/*! Atelier Redoc API reference. Third-party notices: /assets/redoc.licenses.txt */' },
  });
  const inputs = Object.keys(built.metafile.inputs).sort();
  const actualInputs = new Set(inputs.map((file) => resolve(root, file)));
  if (!actualInputs.has(sanitizerEntry) || !actualInputs.has(yamlEntry) ||
      !actualInputs.has(join(redoc.directory, redoc.browser)) ||
      inputs.some((file) => file.endsWith('/redoc.standalone.js')))
    fail('API_DOCS_BUNDLE_DEPENDENCY', 'The API reference must bundle the resolved external sanitizer and YAML parser');
  const javascript = built.outputFiles.find((file) => basename(file.path) === 'atelier-redoc.js')?.text;
  const notices = built.outputFiles.find((file) => basename(file.path) === 'atelier-redoc.js.LEGAL.txt')?.text;
  if (!javascript || !notices || Buffer.byteLength(javascript) > 4 * 1024 * 1024 ||
      /\.version\s*=\s*["']3\.2\.4["']/.test(javascript))
    fail('API_DOCS_BUNDLE_INVALID', 'The API reference build or dependency notices are invalid');
  const licenses = [
    'Atelier Redoc API reference — third-party notices',
    `Redoc ${redoc.version}`,
    await readFile(join(redoc.directory, 'LICENSE'), 'utf8'),
    await readFile(join(redoc.directory, 'bundles/redoc.browser.lib.js.LICENSE.txt'), 'utf8'),
    `DOMPurify ${sanitizer.version}`,
    await readFile(join(sanitizer.directory, 'LICENSE'), 'utf8'),
    'Notices retained from the exact bundled modules',
    notices,
  ].join('\n\n');
  const evidence = Object.freeze({
    schemaVersion: 1,
    dependencies: Object.freeze({ redoc: redoc.version, dompurify: sanitizer.version, 'js-yaml': yaml.version, esbuild: esbuildVersion }),
    inputs: Object.freeze(inputs),
    javascriptSha256: digest(javascript),
    licensesSha256: digest(licenses),
  });
  return Object.freeze({ javascript, licenses, evidence });
}

let renderer;
/** One build per process, shared by concurrent requests. A failed build stays
 * failed until restart; requests cannot trigger repeated compiler work. */
export function getApiDocsRenderer() {
  return renderer ??= buildApiDocsRenderer();
}
