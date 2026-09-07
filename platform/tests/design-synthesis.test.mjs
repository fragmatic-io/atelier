import assert from 'node:assert/strict';
import test from 'node:test';
import { bindDesignSynthesis } from '../packages/design-genome/src/synthesis.mjs';
import { DiscoveryService } from '../packages/discovery/src/service.mjs';
import { fixture, runJob } from './v21/helpers.mjs';

const contract = {
  version: 1,
  viewport: { bucket: 'desktop', colorScheme: 'light' },
  roles: {
    root: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '14px',
      color: 'rgb(20, 24, 31)',
      backgroundColor: 'rgb(255, 255, 255)',
    },
    button: { borderRadius: '8px', height: '36px' },
  },
  privacy: {
    pageTextCaptured: false,
    domCaptured: false,
    formValuesCaptured: false,
    computedStylesOnly: true,
  },
};

const synthesis = {
  summary: 'Compact operational interface with restrained controls.',
  density: 'compact',
  hierarchy: 'sectioned',
  interactionTone: 'direct',
  patterns: [
    {
      name: 'Compact controls',
      guidance: 'Keep primary controls close to the observed host height.',
      confidence: 0.9,
      evidence: [{ role: 'button', property: 'height', value: '36px' }],
    },
  ],
  avoid: ['Do not invent decorative tokens.'],
};

test('agentic Design Genome evidence cannot escape the approved contract', () => {
  const bound = bindDesignSynthesis(synthesis, contract);
  assert.equal(bound.contractFingerprint.length, 64);
  assert.equal(bound.synthesisFingerprint.length, 64);
  assert.throws(
    () =>
      bindDesignSynthesis(
        {
          ...synthesis,
          patterns: [
            {
              ...synthesis.patterns[0],
              evidence: [{ role: 'button', property: 'height', value: '44px' }],
            },
          ],
        },
        contract,
      ),
    { code: 'DESIGN_SYNTHESIS_UNGROUNDED' },
  );
});

test('design synthesis is provider-backed, contract-bound and human-reviewed', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const discovery = new DiscoveryService(f.service);
  const source = discovery.create(f.who, f.tenant.id, f.project.id, {
    name: 'Design observer',
    kind: 'browser',
    allowedOrigins: ['https://app.example'],
    designCapture: true,
  });
  discovery.ingest(source.projectKey, 'https://app.example', {
    heartbeat: true,
    design: contract,
  });
  const observed = discovery.design(f.who, f.tenant.id, f.project.id).observations[0];
  discovery.approveDesign(f.who, f.tenant.id, f.project.id, {
    fingerprint: observed.fingerprint,
  });
  assert.throws(() => discovery.synthesizeDesign(f.who, f.tenant.id, f.project.id), {
    code: 'PROVIDER_REQUIRED',
  });
  const connection = f.service.createConnection(f.who, f.tenant.id, {
    name: 'Design fixture',
    kind: 'openai',
    apiKey: 'test-only-key',
    model: 'fixture-model',
    projectId: f.project.id,
  });
  let project = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: project.revision,
    providerId: connection.id,
    model: 'fixture-model',
  });
  discovery.synthesizeDesign(f.who, f.tenant.id, f.project.id);
  await runJob(f, {
    apiFactory: () => ({
      generate: async () => ({
        value: synthesis,
        usage: { inputTokens: 30, outputTokens: 20 },
        model: 'fixture-model',
        provider: 'contract-fixture',
      }),
    }),
  });
  let design = discovery.design(f.who, f.tenant.id, f.project.id);
  assert.equal(design.syntheses[0].status, 'draft');
  assert.equal(design.syntheses[0].synthesis.model, 'fixture-model');
  discovery.reviewDesignSynthesis(
    f.who,
    f.tenant.id,
    f.project.id,
    design.syntheses[0].id,
    { approved: true },
  );
  design = discovery.design(f.who, f.tenant.id, f.project.id);
  assert.equal(design.syntheses[0].status, 'approved');
});
