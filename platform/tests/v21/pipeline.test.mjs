import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, scanned, generated, runJob, sample } from './helpers.mjs';
import { createSnapshot } from '../../scripts/snapshot.mjs';
import { verifySignedBundle } from '../../packages/runtime/src/index.mjs';
import { projectAccess } from '../../packages/control-plane/src/access.mjs';
test('end-to-end: source → real AST → three native kits → human review → signed deployment → rollback', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const scan = await scanned(f),
    m = f.service.model(f.who, f.tenant.id, f.project.id);
  assert.ok(m.ast.version);
  assert.equal(m.ast.issues.length, 0);
  assert.ok(m.components.some((x) => x.propsSchema));
  assert.ok(scan.capabilities >= 5);
  for (const c of m.capabilities.filter((x) => x.kind === 'command'))
    f.service.reviewCapability(f.who, f.tenant.id, f.project.id, c.id, {
      risk: c.risk === 'read_only' ? 'sensitive' : c.risk,
      confirmation: 'modal',
      reversible: false,
      requiredPermissions: c.requiredPermissions,
      piiFields: c.piiFields,
    });
  const out = await generated(f);
  assert.equal(out.releaseIds.length, 3);
  const [one, two] = out.releaseIds;
  let r = f.service.release(f.who, f.tenant.id, f.project.id, one);
  assert.ok(r.artifact.kit.verification.passed);
  assert.equal(r.artifact.evaluation.visual.status, 'not-run');
  assert.ok(r.artifact.bundle.actionContracts.length > 0);
  assert.throws(() => f.service.publish(f.who, f.tenant.id, f.project.id, one), /Approve/);
  assert.throws(
    () => f.service.approve(f.who, f.tenant.id, f.project.id, one, { approved: true }),
    /preview/,
  );
  f.service.approve(f.who, f.tenant.id, f.project.id, one, {
    approved: true,
    previewReviewed: true,
  });
  f.service.publish(f.who, f.tenant.id, f.project.id, one, { revision: 0 });
  const token = f.service.createToken(f.who, f.tenant.id, f.project.id, { name: 'Host' });
  const identity = f.auth.identity({ authorization: `Bearer ${token.token}` });
  const ctx = {
    slotId: 'customer.detail.right-rail',
    environment: 'staging',
    subject: 'actual-user',
    role: 'support_manager',
    permissions: ['customer.read', 'customer.intervene', 'customer.archive'],
  };
  const resolved = f.service.resolve(identity, f.tenant.id, f.project.id, ctx);
  assert.ok(verifySignedBundle(resolved.bundle, resolved.publicKeys));
  assert.equal(resolved.bundle.tenantId, f.tenant.id);
  assert.equal(resolved.bundle.releaseId, one);
  assert.equal(
    f.service.resolve(identity, f.tenant.id, f.project.id, { ...ctx, permissions: [] }).bundle,
    null,
  );
  f.service.approve(f.who, f.tenant.id, f.project.id, two, {
    approved: true,
    previewReviewed: true,
  });
  assert.throws(
    () => f.service.publish(f.who, f.tenant.id, f.project.id, two, { revision: 0 }),
    /changed/i,
  );
  f.service.publish(f.who, f.tenant.id, f.project.id, two, { revision: 1 });
  f.service.rollback(f.who, f.tenant.id, f.project.id, {
    slotId: ctx.slotId,
    environment: 'staging',
    revision: 2,
  });
  assert.equal(f.service.resolve(identity, f.tenant.id, f.project.id, ctx).bundle.releaseId, one);
  assert.equal(f.service.store.verifyAudit(f.tenant.id).valid, true);
});
test('unchanged snapshot yields stable version; unchanged verified command metadata survives rescan', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  let m = f.service.model(f.who, f.tenant.id, f.project.id);
  const c = m.capabilities.find((x) => x.kind === 'command');
  f.service.reviewCapability(f.who, f.tenant.id, f.project.id, c.id, {
    risk: 'sensitive',
    confirmation: 'modal',
    reversible: false,
    requiredPermissions: c.requiredPermissions,
  });
  m = f.service.model(f.who, f.tenant.id, f.project.id);
  f.service.upload(f.who, f.tenant.id, f.project.id, await createSnapshot(sample));
  await runJob(f);
  const next = f.service.model(f.who, f.tenant.id, f.project.id);
  assert.equal(next.capabilities.find((x) => x.id === c.id).securityReviewed, true);
  assert.equal(next.projectVersion, m.projectVersion);
});
test('provider-neutral agent pipeline uses architect/designer/critic and persists scoped cache', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const con = f.service.createConnection(f.who, f.tenant.id, {
    name: 'Contract fixture',
    kind: 'openai',
    apiKey: 'test-only-key',
    model: 'fixture-model',
    projectId: f.project.id,
  });
  const p = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: p.revision,
    providerId: con.id,
    model: 'fixture-model',
  });
  const stages = [];
  const apiFactory = () => ({
    async generate(req) {
      let value;
      if (req.schema.properties.workflow) {
        stages.push('architect');
        value = {
          goal: 'Understand context',
          workflow: ['Review', 'Act'],
          successCriteria: ['Complete safely'],
          avoid: ['Unverified actions'],
        };
      } else if (req.schema.properties.sections) {
        stages.push('designer');
        const task = req.input.knowledge.task,
          ids = [...new Set(task.requiredInformation.map((x) => x.capabilityId))];
        value = {
          title: 'A clearer customer picture',
          description: 'Verified context in one place',
          layout: 'focus',
          rationale: 'Reuse the host grammar',
          sections: ids.map((id) => ({
            source: id,
            title: 'Customer context',
            fields: task.requiredInformation
              .filter((x) => x.capabilityId === id)
              .map((x) => x.field),
            variant: 'facts',
          })),
          actions: task.permittedActions.map((id) => ({ capabilityId: id, label: id })),
        };
      } else {
        stages.push('critic');
        value = { approved: true, issues: [], strengths: ['Complete context'] };
      }
      return {
        value,
        usage: { inputTokens: 20, outputTokens: 10 },
        model: 'fixture-model',
        provider: 'contract-fixture',
      };
    },
  });
  const first = await generated(f, { mode: 'model', variants: 1, apiFactory });
  assert.deepEqual(stages, ['architect', 'designer', 'critic']);
  const second = await generated(f, { mode: 'model', variants: 1, apiFactory });
  assert.equal(stages.length, 3);
  assert.notEqual(first.releaseIds[0], second.releaseIds[0]);
  assert.ok(f.service.usage(f.who, f.tenant.id, f.project.id)[0].cache_hits >= 3);
});
test('model design repair receives exact approved coverage after an omission', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const con = f.service.createConnection(f.who, f.tenant.id, {
    name: 'Repair fixture',
    kind: 'openai',
    apiKey: 'test-only-key',
    model: 'fixture-model',
    projectId: f.project.id,
  });
  const project = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: project.revision,
    providerId: con.id,
    model: 'fixture-model',
  });
  let designerCalls = 0;
  const apiFactory = () => ({
    async generate(req) {
      let value;
      if (req.schema.properties.workflow) {
        value = {
          goal: 'Understand context',
          workflow: ['Review'],
          successCriteria: ['Complete safely'],
          avoid: ['Unverified actions'],
        };
      } else if (req.schema.properties.sections) {
        designerCalls += 1;
        const coverage = req.input.requiredCoverage;
        assert.ok(coverage.information.length > 0);
        assert.deepEqual(coverage.actions, req.input.knowledge.task.permittedActions);
        if (designerCalls === 2) {
          assert.equal(req.input.repair[0].code, 'MISSING_INFORMATION');
          assert.equal(
            req.input.repair[0].details.capabilityId,
            coverage.information.at(-1).capabilityId,
          );
          assert.deepEqual(req.input.repair[0].details.missingFields, [coverage.information.at(-1).fields.at(-1)]);
        }
        assert.ok(coverage.information.at(-1).fields.length > 1);
        const included = coverage.information.map((source, index) => ({
          ...source,
          fields:
            designerCalls === 1 && index === coverage.information.length - 1
              ? source.fields.slice(0, -1)
              : source.fields,
        }));
        value = {
          title: 'Risk overview',
          description: 'Approved operational context',
          layout: 'workbench',
          rationale: 'Preserve every approved information source',
          sections: included.map((source) => ({
            source: source.capabilityId,
            title: 'Operational context',
            fields: source.fields,
            variant: 'facts',
          })),
          actions: coverage.actions.map((capabilityId) => ({ capabilityId, label: capabilityId })),
        };
      } else {
        value = { approved: true, issues: [], strengths: ['Complete context'] };
      }
      return {
        value,
        usage: { inputTokens: 20, outputTokens: 10 },
        model: 'fixture-model',
        provider: 'repair-fixture',
      };
    },
  });
  const result = await generated(f, { mode: 'model', variants: 1, apiFactory });
  assert.equal(result.releaseIds.length, 1);
  assert.equal(designerCalls, 2);
});
test('source snapshot never executes configuration, scripts, source modules or server actions', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  f.service.upload(f.who, f.tenant.id, f.project.id, {
    files: [
      { path: 'atelier.config.mjs', content: 'throw new Error("SOURCE MUST NOT EXECUTE")' },
      {
        path: 'app/api/items/route.ts',
        content: 'export async function GET(){throw new Error("NEVER EXECUTE")}',
      },
    ],
  });
  assert.ok((await runJob(f)).modelId);
});
