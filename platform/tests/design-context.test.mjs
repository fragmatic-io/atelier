import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import { hash } from '../packages/control-plane/src/util.mjs';
import { normalizeDesignContract } from '../packages/discovery/src/design-contract.mjs';
import { designStyles } from '../packages/surface-install/src/design-css.mjs';
import { DESIGN_PROPERTIES } from '../packages/design-genome/src/design-registry.mjs';
import { resolveDesignContext, assertDesignContext } from '../packages/design-genome/src/design-context.mjs';
import { bindDesignSynthesis } from '../packages/design-genome/src/synthesis.mjs';

const contract = () => normalizeDesignContract({
  viewport: { bucket: 'desktop', colorScheme: 'dark' },
  roles: {
    root: { fontFamily: '"Atelier Host", sans-serif', fontSize: '16px', fontWeight: '450', lineHeight: '1.6', color: '#ecf0fa', backgroundColor: '#191a20', borderColor: '#444952', borderRadius: '8px', paddingBlock: '24px', paddingInline: '32px', height: 'auto', gap: '18px', boxShadow: 'none' },
    button: { backgroundColor: '#acdcce', color: '#112622', paddingBlock: '10px', paddingInline: '14px' },
    input: { borderColor: '#708079' },
    card: { backgroundColor: '#262932', borderRadius: '12px' },
    nav: { gap: '22px', paddingBlock: '7px', paddingInline: '18px' },
  },
});
const model = () => ({ projectVersion: 'project-design-1', designGenome: { hardTokens: { all: { 'color-primary': '#123456', 'color-text-muted': '#aabbcc', 'spacing-md': '12px' } } }, capabilities: [{ id: 'ticket.update', securityReviewed: true }] });
const synthesis = (approved = contract()) => bindDesignSynthesis({
  summary: 'Controls follow the observed host spacing.',
  density: 'balanced', hierarchy: 'sectioned', interactionTone: 'direct',
  patterns: [{ name: 'Host navigation', guidance: 'Preserve navigation spacing.', confidence: 1, evidence: [{ role: 'nav', property: 'gap', value: approved.roles.nav.gap }] }],
  avoid: ['Do not replace the approved palette.'],
}, approved);

test('all accepted computed-style properties survive scoped CSS, including nav and logical spacing', () => {
  const approved = contract();
  const css = postcss.parse(designStyles('install_host_1', approved));
  const root = css.nodes.find((node) => node.selector === '[data-atelier-install="install_host_1"]');
  const values = Object.fromEntries(root.nodes.map((node) => [node.prop, node.value]));
  assert.equal(Object.keys(values).length, Object.keys(approved.roles.root).length);
  assert.equal(values['padding-block'], '24px');
  assert.equal(values['padding-inline'], '32px');
  assert.equal(values.gap, '18px');
  const nav = css.nodes.find((node) => node.selector.includes('role="navigation"'));
  assert.ok(nav.selector.startsWith('[data-atelier-install="install_host_1"] :where(nav,'));
  assert.deepEqual(Object.fromEntries(nav.nodes.map((node) => [node.prop, node.value])), { 'padding-block': '7px', 'padding-inline': '18px', gap: '22px' });
});

test('the standalone observer vocabulary stays compatible with the shared design registry', async () => {
  const source = await readFile(new URL('../packages/discovery/src/observer.js', import.meta.url), 'utf8');
  const declarations = source.match(/const designProperties = \[([\s\S]*?)\];/)[1];
  const observed = [...declarations.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(observed, Object.keys(DESIGN_PROPERTIES));
});

test('design CSS rejects unsafe values, roles and interpolation instead of silently dropping them', () => {
  for (const value of [' ', 'url(https://evil.invalid/a)', 'red;display:none', 'expression(alert(1))'])
    assert.throws(() => designStyles('install_1', { roles: { root: { color: value } } }), { code: 'DESIGN_VALUE' });
  assert.throws(() => designStyles('x"]{color:red}/*', contract()), { code: 'DESIGN_SCOPE' });
  assert.throws(() => normalizeDesignContract({ roles: { root: {}, arbitrary: { color: 'red' } } }), { code: 'DESIGN_ROLE' });
  assert.throws(() => normalizeDesignContract({ roles: { root: { position: 'fixed' } } }), { code: 'DESIGN_PROPERTY' });
  assert.throws(() => normalizeDesignContract({ roles: { root: [] } }), { code: 'DESIGN_ROLE' });
});

test('resolved host tokens and guidance have an order-independent, evidence-bound hash', () => {
  const approved = contract();
  const inputModel = model();
  const before = structuredClone(inputModel);
  const context = resolveDesignContext({ model: inputModel, approvedContract: approved, approvedSynthesis: synthesis(approved) });
  assert.equal(context.version, 1);
  assert.equal(context.contractFingerprint, hash(approved));
  assert.equal(context.tokens.primary, approved.roles.button.backgroundColor);
  assert.equal(context.tokens['color-primary'], '#123456');
  assert.equal(context.tokens['font-family'], approved.roles.root.fontFamily);
  assert.equal(context.tokens['atelier-nav-padding-inline'], '18px');
  assert.equal(context.tokens['atelier-nav-gap'], '22px');
  assert.equal(context.tokens.muted, '#aabbcc');
  assert.equal(assertDesignContext(context), context);
  assert.deepEqual(inputModel, before);
  const reordered = { ...approved, roles: Object.fromEntries(Object.entries(approved.roles).reverse().map(([role, values]) => [role, Object.fromEntries(Object.entries(values).reverse())])) };
  assert.equal(resolveDesignContext({ model: inputModel, approvedContract: reordered, approvedSynthesis: { ...synthesis(approved), provider: 'another-provider', model: 'another-model', cacheHit: true } }).hash, context.hash);
  const changed = structuredClone(approved);
  changed.roles.nav.gap = '23px';
  assert.notEqual(resolveDesignContext({ model: inputModel, approvedContract: changed }).hash, context.hash);
});

test('context integrity, synthesis binding and token validation fail closed', () => {
  const context = resolveDesignContext({ model: model(), approvedContract: contract() });
  const tampered = structuredClone(context);
  tampered.tokens.primary = '#ffffff';
  assert.throws(() => assertDesignContext(tampered), { code: 'DESIGN_CONTEXT_TAMPER' });
  const { hash: ignored, ...body } = tampered;
  assert.throws(() => assertDesignContext({ ...body, hash: hash(body) }), { code: 'DESIGN_CONTEXT_TAMPER' });
  const changed = contract();
  changed.roles.nav.gap = '24px';
  assert.throws(() => resolveDesignContext({ model: model(), approvedContract: changed, approvedSynthesis: synthesis() }), { code: 'DESIGN_SYNTHESIS_UNGROUNDED' });
  assert.throws(() => resolveDesignContext({ model: model(), approvedSynthesis: synthesis() }), { code: 'DESIGN_REVIEW_REQUIRED' });
  assert.throws(() => resolveDesignContext({ model: { designGenome: { hardTokens: { all: { primary: 'url(https://evil.invalid)' } } } } }), { code: 'DESIGN_VALUE' });
  assert.throws(() => resolveDesignContext({ model: { designGenome: { hardTokens: { all: JSON.parse('{"--__proto__":"red"}') } } } }), { code: 'DESIGN_TOKEN_NAME' });
  const normalized = resolveDesignContext({ model: model(), approvedContract: contract(), approvedSynthesis: synthesis() });
  const { hash: previousHash, ...unnormalized } = structuredClone(normalized);
  unnormalized.guidance.provider = 'metadata-must-not-be-in-resolved-context';
  assert.throws(() => assertDesignContext({ ...unnormalized, hash: hash(unnormalized) }), { code: 'DESIGN_SYNTHESIS' });
});

test('reviewed component declarations bind states, interactions and taste to existing evidence', () => {
  const approved = contract();
  const component = {
    id: 'ticket-panel', version: '1', dataBound: true, roles: ['root', 'button', 'nav'],
    states: ['ready', 'loading', 'empty', 'error'],
    interaction: { keyboard: true, focusVisible: true, accessibleName: true, actions: ['ticket.update'] },
    taste: { tokenNames: ['primary'], patternNames: ['Host navigation'] },
  };
  const resolve = (entry) => resolveDesignContext({ model: model(), approvedContract: approved, approvedSynthesis: synthesis(approved), componentContracts: [entry] });
  const context = resolve(component);
  assert.equal(assertDesignContext(context), context);
  assert.throws(() => resolve({ ...component, states: ['ready'] }), { code: 'COMPONENT_STATES' });
  assert.throws(() => resolve({ ...component, interaction: { ...component.interaction, actions: ['tenant.destroy'] } }), { code: 'UNAPPROVED_ACTION' });
  assert.throws(() => resolve({ ...component, taste: { ...component.taste, tokenNames: ['invented-blue'] } }), { code: 'COMPONENT_DESIGN_EVIDENCE' });
  assert.throws(() => resolve({ ...component, taste: { ...component.taste, patternNames: ['unreviewed-pattern'] } }), { code: 'COMPONENT_DESIGN_EVIDENCE' });
});

test('standalone contexts carry no invented host evidence or palette', () => {
  const context = resolveDesignContext();
  assert.equal(context.contractFingerprint, null);
  assert.equal(context.viewport, null);
  assert.deepEqual(context.roles, {});
  assert.deepEqual(context.tokens, {});
  assert.equal(context.guidance, null);
  assert.equal(assertDesignContext(context), context);
});
