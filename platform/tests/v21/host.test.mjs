import test from 'node:test';
import assert from 'node:assert/strict';
import { HostBridge, SqliteActionLedger } from '../../packages/host-sdk/src/index.mjs';
import { generateSigningKeyPair, signBundle } from '../../packages/runtime/src/index.mjs';
function setup(t) {
  let now = Date.now(),
    executions = 0,
    authorized = true;
  const key = generateSigningKeyPair({ keyId: 'host-test' }),
    ledger = new SqliteActionLedger(':memory:');
  t.after(() => ledger.close());
  const bundle = {
    tenantId: 't',
    projectId: 'p',
    slotId: 'customer.rail',
    environment: 'production',
    releaseId: 'r',
    bundleId: 'b',
    activation: { role: 'support' },
    dataContracts: [
      {
        id: 'customer.read',
        inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' }, email: { type: 'string' } },
          required: ['name', 'email'],
        },
        fields: ['name'],
        requiredPermissions: ['read'],
      },
    ],
    actionContracts: [
      {
        id: 'customer.archive',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
          additionalProperties: false,
        },
        securityReviewed: true,
        requiredPermissions: ['write'],
        risk: 'destructive',
        confirmation: 'modal',
      },
    ],
  };
  let signed = signBundle(bundle, key);
  const bridge = new HostBridge({
    tenantId: 't',
    projectId: 'p',
    confirmationKey: Buffer.alloc(32, 4),
    ledger,
    authorize: async () => authorized,
    clock: () => now,
    transport: async () => ({ bundle: signed, publicKeys: { [key.keyId]: key.publicKey } }),
    loaders: {
      'customer.read': async () => ({ name: 'Authorized account', email: 'private@example.test' }),
    },
    executors: {
      'customer.archive': async ({ operationId }) => ({
        ok: true,
        count: ++executions,
        operationId,
      }),
    },
  });
  const args = {
    subject: { id: 'user', role: 'support', permissions: ['read', 'write'] },
    slotId: 'customer.rail',
    releaseId: 'r',
    capability: 'customer.archive',
    input: { id: 'account1' },
    context: { customerId: 'account1' },
  };
  return {
    bridge,
    args,
    bundle,
    key,
    setSigned: (v) => (signed = v),
    setTime: (v) => (now = v),
    now,
    deny: () => (authorized = false),
    executions: () => executions,
    ledger,
  };
}
test('host SDK projects authorized fields; raw PII never reaches the UI', async (t) => {
  const f = setup(t);
  const value = await f.bridge.load({ ...f.args, capability: 'customer.read' });
  assert.deepEqual(value, { name: 'Authorized account' });
});
test('host SDK requires current authenticated object authorization', async (t) => {
  const f = setup(t);
  f.deny();
  await assert.rejects(() => f.bridge.confirm(f.args), /host rejected/i);
  assert.equal(f.executions(), 0);
});
test('confirmation binds user, entity, input, action and release; duplicate dispatch executes once', async (t) => {
  const f = setup(t),
    confirmation = await f.bridge.confirm(f.args);
  for (const patch of [
    { input: { id: 'other' } },
    { context: { customerId: 'other' } },
    { subject: { ...f.args.subject, id: 'other' } },
  ])
    await assert.rejects(
      () => f.bridge.dispatch({ ...f.args, ...patch, ticket: confirmation.ticket }),
      /changed after/,
    );
  const a = await f.bridge.dispatch({ ...f.args, ticket: confirmation.ticket }),
    b = await f.bridge.dispatch({ ...f.args, ticket: confirmation.ticket });
  assert.equal(a.replayed, false);
  assert.equal(b.replayed, true);
  assert.equal(f.executions(), 1);
  assert.deepEqual(a.result, b.result);
});
test('expired and forged confirmation tickets cannot execute', async (t) => {
  const f = setup(t),
    c = await f.bridge.confirm(f.args);
  await assert.rejects(
    () => f.bridge.dispatch({ ...f.args, ticket: c.ticket + 'bad' }),
    /invalid/i,
  );
  f.setTime(f.now + 121000);
  await assert.rejects(() => f.bridge.dispatch({ ...f.args, ticket: c.ticket }), /expired/);
  assert.equal(f.executions(), 0);
});
test('signature, tenant scope and release rotation invalidate the host surface', async (t) => {
  const f = setup(t);
  f.setSigned(signBundle({ ...f.bundle, tenantId: 'other' }, f.key));
  await assert.rejects(() => f.bridge.confirm(f.args), /tenant/);
  f.setSigned(signBundle({ ...f.bundle, releaseId: 'new' }, f.key));
  await assert.rejects(() => f.bridge.confirm(f.args), /surface changed/i);
  f.setSigned({ ...signBundle(f.bundle, f.key), slotId: 'evil' });
  await assert.rejects(() => f.bridge.confirm(f.args), /hash/);
});
test('permission revocation is enforced even with previously valid confirmation', async (t) => {
  const f = setup(t),
    c = await f.bridge.confirm(f.args);
  await assert.rejects(
    () =>
      f.bridge.dispatch({
        ...f.args,
        subject: { ...f.args.subject, permissions: ['read'] },
        ticket: c.ticket,
      }),
    /permission/,
  );
  assert.equal(f.executions(), 0);
});
test('interrupted side effects remain uncertain instead of being silently replayed', async (t) => {
  const f = setup(t);
  await assert.rejects(() =>
    f.ledger.run('scope', 'abcdefghijklmnop', 'hash', async () => {
      throw new Error('network broke after commit');
    }),
  );
  await assert.rejects(
    () =>
      f.ledger.run('scope', 'abcdefghijklmnop', 'hash', async () => assert.fail('must not replay')),
    /uncertain/,
  );
  assert.equal(f.ledger.reconcile('scope', 'abcdefghijklmnop', { confirmedBySystem: true }), true);
  assert.equal(
    (await f.ledger.run('scope', 'abcdefghijklmnop', 'hash', () => assert.fail())).replayed,
    true,
  );
});
