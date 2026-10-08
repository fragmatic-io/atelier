import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compileSourceKit, verifyCompilation, sandboxDocument, exportSourceKit, verifyExport, resolveDesignContext } from '../../packages/source-forge/src/compiler.mjs';
import { hash } from '../../packages/control-plane/src/util.mjs';
import { normalizeQualityContract } from '../../packages/source-forge/src/quality-contract.mjs';

const kitUrl = new URL('../../examples/source-kits/delivery-board.json', import.meta.url);
const storyboardUrl = new URL('../../examples/source-kits/storyboard.json', import.meta.url);

const hostContext = (color = '#a1ccb8') => resolveDesignContext({
  model: { projectVersion: 'host-design-v1', designGenome: { hardTokens: { all: { 'color-text-muted': '#aebbc7' } } } },
  approvedContract: {
    viewport: { bucket: 'desktop', colorScheme: 'dark' },
    roles: {
      root: { fontFamily: '"Host Sans", sans-serif', fontSize: '17px', lineHeight: '1.6', color: '#ecf0fa', backgroundColor: '#11191b' },
      button: { backgroundColor: color, color: '#11221a', paddingBlock: '11px', paddingInline: '19px' },
      nav: { gap: '23px' },
    },
  },
});

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

test('compiled source carries the same verified host design into the sandbox and exported contract', async (t) => {
  const kit = JSON.parse(await readFile(kitUrl, 'utf8'));
  const designContext = hostContext();
  const qualityContract = normalizeQualityContract({ goal: kit.description }, { approvedActions: kit.actions });
  const compiled = await compileSourceKit(kit, { designContext, qualityContract, approvedActions: kit.actions });
  assert.equal(compiled.projectVersion, designContext.projectVersion);
  assert.deepEqual(compiled.designContext, designContext);
  assert.deepEqual(compiled.tokens, designContext.tokens);
  assert.deepEqual(compiled.qualityContract, qualityContract);
  const document = sandboxDocument(compiled);
  assert.match(document.html, /data-theme="dark"/);
  assert.match(document.html, /--font-family:"Host Sans", sans-serif;/);
  assert.match(document.html, /--primary:#a1ccb8;/);
  assert.match(document.html, /padding-block:11px!important/);
  assert.match(document.html, /padding-inline:19px!important/);
  assert.match(document.html, /nav,\[role="navigation"\].*?\{gap:23px!important\}/);
  assert.ok(document.html.includes(`"hash":"${designContext.hash}"`));
  assert.ok(document.html.includes('"context":{"designContext":'));
  assert.doesNotMatch(document.html, /--primary:#3863d4|--surface:#142034|font:15px\/1\.5 system-ui/);
  assert.match(document.csp, /connect-src 'none'/);
  assert.match(document.csp, /sandbox allow-scripts/);
  const temp = await mkdtemp(join(tmpdir(), 'atelier-design-export-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const directory = join(temp, 'source');
  await exportSourceKit(compiled, directory);
  const exported = JSON.parse(await readFile(join(directory, 'design-context.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(directory, 'contract.json'), 'utf8'));
  assert.equal(exported.hash, designContext.hash);
  assert.equal(manifest.designContextHash, designContext.hash);
  assert.equal(manifest.qualityContractHash, qualityContract.hash);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'quality-contract.json'), 'utf8')), qualityContract);
  assert.ok((await verifyExport(directory)).verified > 0);
});

test('host design changes invalidate compiled evidence and cannot be overridden at compile time', async () => {
  const kit = JSON.parse(await readFile(kitUrl, 'utf8'));
  const designContext = hostContext();
  const compiled = await compileSourceKit(kit, { designContext, approvedActions: kit.actions });
  const changed = await compileSourceKit(kit, { designContext: hostContext('#d0b695'), approvedActions: kit.actions });
  assert.notEqual(changed.digest, compiled.digest);
  assert.notEqual(changed.designContext.hash, compiled.designContext.hash);
  await assert.rejects(compileSourceKit(kit, { designContext, projectVersion: 'another-model', approvedActions: kit.actions }), { code: 'DESIGN_PROJECT_CHANGED' });
  await assert.rejects(compileSourceKit(kit, { designContext, tokens: { primary: '#fff' }, approvedActions: kit.actions }), { code: 'DESIGN_TOKEN_OVERRIDE' });
  await assert.rejects(compileSourceKit(kit, { tokens: { primary: 'url(https://evil.invalid/a)' }, approvedActions: kit.actions }), { code: 'DESIGN_VALUE' });
  const outsideQuality = normalizeQualityContract({ goal: kit.description }, { approvedActions: ['outside.action'] });
  await assert.rejects(compileSourceKit(kit, { designContext, qualityContract: outsideQuality, approvedActions: kit.actions }), { code: 'UNAPPROVED_ACTION' });
  assert.throws(() => verifyCompilation({ ...compiled, designContext: changed.designContext }), { code: 'COMPONENT_TAMPER' });
  const { digest: ignored, ...body } = compiled;
  body.tokens = { ...body.tokens, primary: '#fff' };
  assert.throws(() => verifyCompilation({ ...body, digest: hash(body) }), { code: 'DESIGN_CONTEXT_TAMPER' });
});
