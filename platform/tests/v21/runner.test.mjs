import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { projectAccess } from '../../packages/control-plane/src/access.mjs';
import { ModelGateway } from '../../packages/control-plane/src/gateway.mjs';
test('remote CLI request is durable, exactly project-bound, fenced, schema-checked and metered', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const runner = f.service.registerRunner(f.who, f.tenant.id, f.project.id, {
    name: 'Private runner',
    providers: ['codex-cli'],
  });
  const ri = f.auth.identity({ authorization: `Bearer ${runner.token}` });
  const c = f.service.createConnection(f.who, f.tenant.id, {
    projectId: f.project.id,
    name: 'Codex account',
    kind: 'codex-cli',
    runnerId: runner.id,
    model: 'account-model',
  });
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: 1,
    providerId: c.id,
    model: 'account-model',
  });
  const scope = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  f.service.store.enqueue(scope, 'generate', { example: true });
  const job = f.service.store.claim('worker');
  const gateway = new ModelGateway({ db: f.db, store: f.service.store, box: f.box, scope, job });
  const promise = gateway.generate({
    system: 'Return schema JSON',
    input: { x: 1 },
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
  });
  await new Promise((r) => setTimeout(r, 20));
  const { task } = f.service.claimInference(ri, { workerId: 'local-runner' });
  assert.ok(task);
  assert.equal(task.provider, 'codex-cli');
  assert.throws(
    () =>
      f.service.completeInference(ri, task.id, {
        workerId: 'local-runner',
        fence: task.fence + 1,
        result: { value: { ok: true } },
      }),
    /no longer owned/i,
  );
  assert.throws(
    () =>
      f.service.completeInference(ri, task.id, {
        workerId: 'local-runner',
        fence: task.fence,
        result: { value: { evil: 1 } },
      }),
    (e) => e.code === 'MODEL_SCHEMA_INVALID',
  );
  f.service.completeInference(ri, task.id, {
    workerId: 'local-runner',
    fence: task.fence,
    result: { value: { ok: true }, usage: { inputTokens: 20, outputTokens: 5 }, durationMs: 10 },
  });
  assert.equal((await promise).value.ok, true);
  assert.equal(f.service.usage(f.who, f.tenant.id, f.project.id)[0].calls, 1);
  f.service.revokeRunner(f.who, f.tenant.id, f.project.id, runner.id);
  assert.throws(() => f.auth.identity({ authorization: `Bearer ${runner.token}` }), /revoked/);
});
