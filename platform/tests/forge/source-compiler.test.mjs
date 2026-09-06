import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { compileSourceKit, verifyCompilation } from '../../packages/source-forge/src/compiler.mjs';

const kitUrl = new URL('../../examples/source-kits/delivery-board.json', import.meta.url);
const storyboardUrl = new URL('../../examples/source-kits/storyboard.json', import.meta.url);

test('real React source compiles with the locked TypeScript and React toolchain', async () => {
  const kit = JSON.parse(await readFile(kitUrl, 'utf8'));
  const compiled = await compileSourceKit(kit, {
    projectVersion: 'source-compiler-test',
    approvedActions: kit.actions,
  });

  assert.equal(compiled.typeEvidence.passed, true);
  assert.equal(compiled.typeEvidence.compiler, '5.8.3');
  assert.equal(compiled.typeEvidence.allowSyntheticDefaultImports, true);
  assert.equal(compiled.target, 'react');
  assert.match(compiled.javascript, /react/i);
  assert.equal(verifyCompilation(compiled), compiled);
});

test('compiled React evidence is bound to the exact source', async () => {
  const kit = JSON.parse(await readFile(kitUrl, 'utf8'));
  const compiled = await compileSourceKit(kit, {
    projectVersion: 'source-compiler-test',
    approvedActions: kit.actions,
  });

  assert.throws(
    () => verifyCompilation({ ...compiled, javascript: `${compiled.javascript}\n/* changed */` }),
    { code: 'COMPONENT_TAMPER' },
  );
});

test('locally declared names that shadow browser globals remain isolated source', async () => {
  const kit = JSON.parse(await readFile(storyboardUrl, 'utf8'));
  const compiled = await compileSourceKit(kit, {
    projectVersion: 'source-compiler-test',
    approvedActions: kit.actions,
  });

  assert.equal(compiled.typeEvidence.passed, true);
  assert.match(kit.source, /const frames=/);
});

test('undeclared browser globals and prototype-chain access are rejected', async () => {
  const kit = JSON.parse(await readFile(kitUrl, 'utf8'));

  await assert.rejects(
    compileSourceKit(
      { ...kit, source: kit.source.replace('export default', 'window.name; export default') },
      { projectVersion: 'source-compiler-test', approvedActions: kit.actions },
    ),
    (error) =>
      error.code === 'SOURCE_POLICY' &&
      JSON.stringify(error.details).includes('Ambient capability: window'),
  );
  await assert.rejects(
    compileSourceKit(
      { ...kit, source: kit.source.replace('export default', '({}).constructor; export default') },
      { projectVersion: 'source-compiler-test', approvedActions: kit.actions },
    ),
    (error) =>
      error.code === 'SOURCE_POLICY' &&
      JSON.stringify(error.details).includes('Prototype-chain property access'),
  );
});
