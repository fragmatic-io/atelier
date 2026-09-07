import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const platformRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(platformRoot, '..');

test('superseded root framework and duplicate V2.3 harnesses stay removed', () => {
  const retiredRootPaths = [
    '.claude',
    '.husky',
    '.well-known',
    'apps',
    'capabilities',
    'components',
    'docs',
    'evals',
    'packages',
    'policies',
    'recipes',
    'scripts',
    'skills',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.github/actionlint.yaml',
    '.github/dependabot.yml',
    '.github/workflows/actionlint.yml',
    '.github/workflows/atelier-v23-acceptance.yml',
  ];
  for (const path of retiredRootPaths) {
    assert.equal(existsSync(resolve(repositoryRoot, path)), false, `retired root path returned: ${path}`);
  }

  const retiredPlatformPaths = [
    'CHECKPOINT-FILES.json',
    'packages/adapters/react/src/agent.mjs',
    'scripts/probe-native.mjs',
    'scripts/self-test.mjs',
    'scripts/verify.mjs',
    'tests/browser',
    'tests/cli-demo.test.mjs',
    'tests/studio-auth.test.mjs',
    'tests/forge/certify-runner.test.mjs',
    'tests/v23/http-components.test.mjs',
    'packages/surface-install/src/template-dom.mjs',
    'packages/surface-install/src/template-express.mjs',
    'packages/surface-install/src/template-fastapi-bridge.mjs',
    'packages/surface-install/src/template-fastapi-canonical.mjs',
    'packages/surface-install/src/template-fastapi-config.mjs',
    'packages/surface-install/src/template-fastapi-contracts.mjs',
    'packages/surface-install/src/template-fastapi-ledger.mjs',
    'packages/surface-install/src/template-next.mjs',
    'packages/surface-install/src/template-react-router.mjs',
    'packages/surface-install/src/template-vite-fastapi.mjs',
  ];
  for (const path of retiredPlatformPaths) {
    assert.equal(
      existsSync(resolve(platformRoot, path)),
      false,
      `retired platform path returned: ${path}`,
    );
  }
});

test('CLI self-test invokes the canonical package verifier directly', () => {
  const source = readFileSync(resolve(platformRoot, 'packages/cli/src/index.mjs'), 'utf8');
  assert.match(source, /scripts\/reconstruction-verify\.mjs/);
  assert.doesNotMatch(source, /scripts\/(?:self-test|verify|probe-native)\.mjs/);
});

test('package manifest excludes every removed compatibility artifact', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(platformRoot, 'PACKAGE-MANIFEST.json'), 'utf8'),
  );
  const paths = new Set(manifest.files.map((entry) => entry.path));
  for (const path of [
    'CHECKPOINT-FILES.json',
    'packages/adapters/react/src/agent.mjs',
    'scripts/probe-native.mjs',
    'scripts/self-test.mjs',
    'scripts/verify.mjs',
    'tests/browser/host.test.py',
    'tests/browser/studio.test.py',
  ]) {
    assert.equal(paths.has(path), false, `retired artifact remains packaged: ${path}`);
  }
});

test('root repository metadata describes only the current local npm implementation', () => {
  const attributes = readFileSync(resolve(repositoryRoot, '.gitattributes'), 'utf8');
  assert.match(attributes, /package-lock\.json\s+linguist-generated=true -diff/);
  assert.match(attributes, /platform\/PACKAGE-MANIFEST\.json\s+linguist-generated=true -diff/);
  assert.doesNotMatch(attributes, /pnpm-lock|\.well-known\/schemas|packages\/schemas/);
});
