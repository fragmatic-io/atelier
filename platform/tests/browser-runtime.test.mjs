import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveBrowserPython } from '../scripts/run-browser-integration.mjs';

test('browser integration uses an explicit interpreter without substitution', async () => {
  assert.equal(
    await resolveBrowserPython({ root: '/unused', configured: '/private/playwright/python' }),
    '/private/playwright/python',
  );
});
test('browser integration uses the documented project virtual environment', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'atelier-browser-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const python = join(root, '.venv', 'bin', 'python');
  await mkdir(join(root, '.venv', 'bin'), { recursive: true });
  await writeFile(python, '#!/bin/sh\nexit 0\n');
  await chmod(python, 0o700);
  assert.equal(await resolveBrowserPython({ root, configured: '', platform: 'darwin' }), python);
});

test('browser integration fails explicitly when Playwright Python is not configured', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'atelier-browser-runtime-missing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    resolveBrowserPython({ root, configured: '', platform: 'darwin' }),
    /BROWSER_RUNTIME_REQUIRED/,
  );
});

test('canonical acceptance uses the same explicit browser interpreter resolver', async () => {
  const source = await readFile(new URL('../scripts/acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /await resolveBrowserPython\(\{ root \}\)/);
  assert.match(source, /ATELIER_PYTHON: python/);
  assert.doesNotMatch(source, /\?\? 'python3'/);
});
