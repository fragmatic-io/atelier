import test from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import { forgeProjectKit } from '../../packages/control-plane/src/pipeline.mjs';
import { resolveDesignContext, assertDesignContext } from '../../packages/design-genome/src/design-context.mjs';

const fixture = () => {
  const model = {
    projectVersion: 'host-kit-design-1',
    designGenome: { hardTokens: { all: { 'color-primary': '#123456', 'color-text-muted': '#aebbc7' } } },
  };
  const designContext = resolveDesignContext({
    model,
    approvedContract: {
      viewport: { bucket: 'desktop', colorScheme: 'dark' },
      roles: {
        root: { fontFamily: '"Host Sans", sans-serif', fontSize: '17px', fontWeight: '500', lineHeight: '1.6', color: '#ecf0fa', backgroundColor: '#11191b' },
        button: { color: '#11221a', backgroundColor: '#a1ccb8', paddingBlock: '11px', paddingInline: '19px' },
        card: { backgroundColor: '#243432', paddingBlock: '21px', paddingInline: '25px', borderRadius: '9px' },
        nav: { gap: '23px' },
      },
    },
  });
  const bundle = {
    bundleId: 'bundle_design_fixture', slotId: 'ticket.detail',
    presentation: {
      title: 'Ticket detail', description: 'Review the selected ticket', layout: 'focus',
      sections: [{ source: 'ticket.get', title: 'Ticket', fields: ['title'], variant: 'facts' }],
      actions: [{ capabilityId: 'ticket.update', label: 'Update ticket' }],
    },
    dataContracts: [{ id: 'ticket.get', fields: ['title'] }],
    actionContracts: [{ id: 'ticket.update', risk: 'sensitive', confirmation: 'modal' }],
  };
  return { model, designContext, bundle };
};

test('host source exports bind approved typography, control spacing and card roles to the same design context', () => {
  const { model, designContext, bundle } = fixture();
  const kit = forgeProjectKit(bundle, model, { componentMappings: { Panel: '@host/ui', Button: '@host/ui' } }, designContext);
  assert.equal(kit.verification.passed, true);
  const files = Object.fromEntries(kit.files.map((file) => [file.path, file.content]));
  const contract = JSON.parse(files[`${kit.name}.contract.json`]);
  const exported = JSON.parse(files[contract.designContextPath]);
  assert.equal(assertDesignContext(exported).hash, designContext.hash);
  assert.equal(contract.provenance.designContextHash, designContext.hash);
  assert.equal(contract.provenance.projectVersion, designContext.projectVersion);
  assert.equal(contract.tokenBindings.primary, 'primary');
  assert.equal(contract.tokenBindings['on-primary'], 'primary-contrast');
  assert.ok(files[`${kit.name}.tsx`].includes(`<HostPanel data-atelier-install="${kit.name}"`));
  assert.match(files[`${kit.name}.tsx`], /<section data-atelier-design-role="card"/);
  assert.match(files['INTEGRATION.md'], /must forward className, data attributes and accessibility props/);

  const css = postcss.parse(files[`${kit.name}.css`]);
  const scope = `[data-atelier-install="${kit.name}"]`;
  const rootRules = css.nodes.filter((rule) => rule.selector === scope);
  const rootDecls = new Map(rootRules.flatMap((rule) => rule.nodes.map((decl) => [decl.prop, decl])));
  for (const [property, value] of Object.entries({ 'font-family': '"Host Sans", sans-serif', 'font-size': '17px', 'font-weight': '500', 'line-height': '1.6' })) {
    assert.equal(rootDecls.get(property)?.value, value);
    assert.equal(rootDecls.get(property)?.important, true);
  }
  assert.equal(rootDecls.get('--primary').value, '#a1ccb8');
  assert.equal(rootDecls.get('--color-primary').value, '#123456', 'original token remains separately available');
  const buttonRule = css.nodes.find((rule) => rule.selector?.startsWith(`${scope} :where(button,`));
  const buttonDecls = new Map(buttonRule.nodes.map((decl) => [decl.prop, decl]));
  assert.equal(buttonDecls.get('padding-block').value, '11px');
  assert.equal(buttonDecls.get('padding-inline').value, '19px');
  assert.ok(buttonRule.nodes.every((decl) => decl.important), 'approved controls must outrank generated class-and-element rules');
  const cardRule = css.nodes.find((rule) => rule.selector?.startsWith(`${scope} :where([data-surface-card]`));
  assert.ok(cardRule.nodes.some((decl) => decl.prop === 'padding-block' && decl.value === '21px' && decl.important));
  assert.ok(css.nodes.some((rule) => rule.selector?.startsWith(`${scope} :where(nav,`) && rule.nodes.some((decl) => decl.prop === 'gap' && decl.value === '23px' && decl.important)));
});

test('host exports reject a stale or cross-project design context before emitting source', () => {
  const { model, designContext, bundle } = fixture();
  assert.throws(() => forgeProjectKit(bundle, { ...model, projectVersion: 'another-project-version' }, {}, designContext), { code: 'DESIGN_PROJECT_CHANGED' });
  const changed = structuredClone(designContext);
  changed.roles.button.paddingInline = '99px';
  assert.throws(() => forgeProjectKit(bundle, model, {}, changed), { code: 'DESIGN_CONTEXT_TAMPER' });
});
