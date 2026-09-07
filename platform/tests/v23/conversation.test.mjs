import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ready,
  publish,
  useProvider,
  hostCredential,
  runJob,
  model,
  password,
} from './helpers.mjs';
const empty = { message: '', toolCalls: [], calculations: [], artifacts: [], suggestions: [] };
const configuredSpecialist = {
  id: 'research',
  name: 'Research analyst',
  description: 'Reconciles approved evidence.',
  instructions: 'Investigate the question and return an evidence brief.',
  toolIds: ['customer.get'],
};
test('unreviewed endpoints do not become callable agent tools', async (t) => {
  const f = await ready();
  t.after(() => f.db.close());
  assert.throws(() => f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: ['customer.get'] }), {
    code: 'UNREVIEWED_TOOL',
  });
  const p = f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: [] });
  assert.equal(p.tools.length, 0);
});
test('reviewed commands may execute in the browser but still retain confirmation policy', async (t) => {
  const f = await ready({ review: true });
  t.after(() => f.db.close());
  const profile = f.chat.setup(f.who, f.tenant.id, f.project.id, {
    tools: ['customer.get', 'intervention.create'],
    clientTools: ['customer.get', 'intervention.create'],
    enableCommands: true,
    voiceReviewed: true,
  });
  const command = profile.tools.find((tool) => tool.id === 'intervention.create');
  assert.equal(command.execution, 'client');
  assert.equal(command.kind, 'command');
  assert.notEqual(command.confirmation, 'none');
});
test('conversation turn is persisted, encrypted, idempotent and actually executed', async (t) => {
  const f = await ready();
  t.after(() => f.db.close());
  f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: [] });
  const thread = f.chat.create(f.who, f.tenant.id, f.project.id, {
    title: 'Private conversation',
    context: { customerId: 'secret-context-fixture' },
  });
  const args = {
    message: 'private-message-fixture',
    mode: 'demo',
    requestId: 'same-request-fixture',
  };
  const a = f.chat.turn(f.who, f.tenant.id, f.project.id, thread.id, args),
    b = f.chat.turn(f.who, f.tenant.id, f.project.id, thread.id, args);
  assert.equal(a.jobId, b.jobId);
  assert.throws(
    () => f.chat.turn(f.who, f.tenant.id, f.project.id, thread.id, { ...args, message: 'changed' }),
    { code: 'IDEMPOTENCY_CONFLICT' },
  );
  await runJob(f);
  const read = f.chat.read(f.who, f.tenant.id, f.project.id, thread.id);
  assert.equal(read.messages.length, 2);
  assert.equal(read.activeJobId, null);
  const rows = JSON.stringify(f.db.all('SELECT * FROM agent_messages'));
  assert(!rows.includes('private-message-fixture'));
  assert(
    !JSON.stringify(f.db.all('SELECT context_cipher FROM agent_threads')).includes(
      'secret-context-fixture',
    ),
  );
});
test('another project and another member cannot read a private transcript', async (t) => {
  const f = await ready();
  t.after(() => f.db.close());
  f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: [] });
  const x = f.chat.create(f.who, f.tenant.id, f.project.id, { title: 'Only mine' });
  const other = f.service.createProject(f.who, f.tenant.id, { name: 'Different Project' });
  assert.throws(() => f.chat.read(f.who, f.tenant.id, other.id, x.id), { code: 'NOT_FOUND' });
  const user = await f.auth.createUser({
    email: 'another@example.test',
    password,
    displayName: 'Another operator',
  });
  f.db.run(
    'INSERT INTO memberships(tenant_id,user_id,role,created_at) VALUES(?,?,?,?)',
    f.tenant.id,
    user.id,
    'admin',
    f.service.clock(),
  );
  assert.throws(() => f.chat.read({ userId: user.id }, f.tenant.id, f.project.id, x.id), {
    code: 'NOT_FOUND',
  });
});
test('Studio cannot provide an arbitrary host identity', async (t) => {
  const f = await ready();
  t.after(() => f.db.close());
  f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: [] });
  assert.throws(
    () =>
      f.chat.create(
        f.who,
        f.tenant.id,
        f.project.id,
        {},
        { id: 'victim', role: 'admin', permissions: [] },
      ),
    { code: 'HOST_SUBJECT_DENIED' },
  );
  const key = hostCredential(f, ['read', 'run']);
  assert.throws(
    () =>
      f.chat.create(
        key.identity,
        f.tenant.id,
        f.project.id,
        {},
        { id: 'victim', role: 'user', permissions: [] },
      ),
    { code: 'AGENT_TOKEN_REQUIRED' },
  );
});
test('host subjects and permission fingerprints are enforced on every request', async (t) => {
  const f = await ready({ review: true });
  t.after(() => f.db.close());
  f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: ['customer.get'] });
  const key = hostCredential(f),
    host = { id: 'alpha', role: 'operator', permissions: ['customer.read'] },
    thread = f.chat.create(key.identity, f.tenant.id, f.project.id, {}, host);
  assert.throws(
    () => f.chat.read(key.identity, f.tenant.id, f.project.id, thread.id, { ...host, id: 'beta' }),
    { code: 'NOT_FOUND' },
  );
  assert.throws(
    () =>
      f.chat.read(key.identity, f.tenant.id, f.project.id, thread.id, { ...host, permissions: [] }),
    { code: 'GRANTS_CHANGED' },
  );
});
test('specialist profiles are version-bound and cannot widen the approved read allowlist', async (t) => {
  const f = await ready({ review: true });
  t.after(() => f.db.close());
  assert.throws(
    () =>
      f.chat.setup(f.who, f.tenant.id, f.project.id, {
        tools: ['customer.get', 'intervention.create'],
        enableCommands: true,
        specialists: [{ ...configuredSpecialist, toolIds: ['intervention.create'] }],
      }),
    { code: 'SPECIALIST_TOOLS' },
  );
  const profile = f.chat.setup(f.who, f.tenant.id, f.project.id, {
    tools: ['customer.get'],
    specialists: [configuredSpecialist],
    maxDelegations: 2,
  });
  assert.equal(profile.version, 2);
  assert.deepEqual(profile.specialists[0].toolIds, ['customer.get']);
  assert.equal(profile.maxDelegations, 2);
});
test('bounded specialist delegation executes separately and only exposes synthesized output', async (t) => {
  const f = await ready({ review: true });
  t.after(() => f.db.close());
  useProvider(f);
  f.chat.setup(f.who, f.tenant.id, f.project.id, {
    tools: ['customer.get'],
    specialists: [configuredSpecialist],
    maxDelegations: 1,
  });
  const thread = f.chat.create(f.who, f.tenant.id, f.project.id, {}),
    outputs = [
      {
        ...empty,
        delegations: [
          { specialistId: 'research', question: 'Reconcile the private customer evidence.' },
        ],
      },
      { ...empty, message: 'Internal specialist evidence brief.' },
      { ...empty, message: 'Synthesized answer for the customer.' },
    ],
    calls = [],
    apiFactory = () => ({
      generate: async (request) => {
        calls.push(request);
        return {
          value: outputs.shift(),
          provider: 'controlled-fixture',
          model: 'not-a-live-model',
        };
      },
    });
  f.chat.turn(f.who, f.tenant.id, f.project.id, thread.id, {
    message: 'Give me a deep answer',
    requestId: 'specialist-turn',
  });
  assert.equal((await runJob(f, { apiFactory })).status, 'delegated');
  assert.equal((await runJob(f, { apiFactory })).status, 'synthesizing');
  assert.equal((await runJob(f, { apiFactory })).status, 'completed');
  const read = f.chat.read(f.who, f.tenant.id, f.project.id, thread.id);
  assert.deepEqual(
    read.messages.map((message) => message.content.text),
    ['Give me a deep answer', 'Synthesized answer for the customer.'],
  );
  assert.deepEqual(
    calls[1].input.tools.map((tool) => tool.id),
    ['customer.get'],
  );
  assert.equal(calls[1].input.role.id, 'research');
  assert.deepEqual(calls[2].input.availableSpecialists, []);
  const events = f.chat.events(f.who, f.tenant.id, f.project.id, thread.id);
  assert(events.some((event) => event.type === 'specialist.delegated'));
  assert(events.some((event) => event.type === 'specialist.completed'));
  const storedInputs = JSON.stringify(f.db.all('SELECT input_json FROM jobs'));
  assert(!storedInputs.includes('private customer evidence'));
  assert(!storedInputs.includes('Internal specialist evidence'));
});
test('model-selected unregistered capability is rejected before tool execution', async (t) => {
  const f = await ready();
  t.after(() => f.db.close());
  useProvider(f);
  f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: [] });
  const thread = f.chat.create(f.who, f.tenant.id, f.project.id, {});
  const queued = f.chat.turn(f.who, f.tenant.id, f.project.id, thread.id, {
    message: 'Do something',
    requestId: 'unknown-tool-fixture',
  });
  await assert.rejects(
    runJob(f, {
      apiFactory: model({
        ...empty,
        toolCalls: [{ capabilityId: 'system.admin', inputJson: '{}' }],
      }),
    }),
    { code: 'MODEL_SCHEMA_INVALID' },
  );
  assert.equal(f.db.get('SELECT count(*) n FROM agent_calls').n, 0);
  assert.equal(f.chat.read(f.who, f.tenant.id, f.project.id, thread.id).activeJobId, null);
  const failed = f.db.get(
    'SELECT status,error_json FROM jobs WHERE tenant_id=? AND project_id=? AND id=?',
    f.tenant.id,
    f.project.id,
    queued.jobId,
  );
  assert.equal(failed.status, 'failed');
  assert.equal(JSON.parse(failed.error_json).code, 'MODEL_SCHEMA_INVALID');
});
test('authorized host result is projected, proof-bound and resumes exactly once', async (t) => {
  const f = await ready({ review: true });
  t.after(() => f.db.close());
  useProvider(f);
  f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: ['customer.get'] });
  const key = hostCredential(f),
    host = { id: 'alpha', role: 'operator', permissions: ['customer.read'] },
    thread = f.chat.create(
      key.identity,
      f.tenant.id,
      f.project.id,
      { context: { customerId: 'northstar' } },
      host,
    );
  f.chat.turn(
    key.identity,
    f.tenant.id,
    f.project.id,
    thread.id,
    { message: 'Inspect customer', requestId: 'read-test-request' },
    host,
  );
  await runJob(f, {
    apiFactory: model({
      ...empty,
      message: 'Read proposed.',
      toolCalls: [{ capabilityId: 'customer.get', inputJson: '{"customerId":"northstar"}' }],
    }),
  });
  const call = f.chat.read(key.identity, f.tenant.id, f.project.id, thread.id, host).pending[0];
  const lease = f.chat.leaseTool(
    key.identity,
    f.tenant.id,
    f.project.id,
    thread.id,
    call.id,
    {},
    host,
  );
  assert.throws(
    () =>
      f.chat.completeTool(
        key.identity,
        f.tenant.id,
        f.project.id,
        thread.id,
        call.id,
        { leaseToken: 'wrong', status: 'succeeded', result: {} },
        host,
      ),
    { code: 'CALL_PROOF' },
  );
  const value = {
    leaseToken: lease.leaseToken,
    status: 'succeeded',
    result: {
      id: 'northstar',
      name: 'Northstar Retail',
      riskScore: 45,
      status: 'at_risk',
      email: 'do-not-expose@example.test',
      secret: 'hidden',
    },
  };
  const first = f.chat.completeTool(
      key.identity,
      f.tenant.id,
      f.project.id,
      thread.id,
      call.id,
      value,
      host,
    ),
    again = f.chat.completeTool(
      key.identity,
      f.tenant.id,
      f.project.id,
      thread.id,
      call.id,
      value,
      host,
    );
  assert(first.nextJobId);
  assert.equal(again.replayed, true);
  const messages = f.chat.read(key.identity, f.tenant.id, f.project.id, thread.id, host).messages;
  assert(!JSON.stringify(messages).includes('do-not-expose'));
  assert(!JSON.stringify(messages).includes('hidden'));
  assert.throws(
    () =>
      f.chat.completeTool(
        key.identity,
        f.tenant.id,
        f.project.id,
        thread.id,
        call.id,
        { ...value, result: { ...value.result, riskScore: 90 } },
        host,
      ),
    { code: 'TOOL_RESULT_CONFLICT' },
  );
});
test('commands require exact confirmation and become uncertain after a lease expires', async (t) => {
  const f = await ready({ review: true });
  t.after(() => f.db.close());
  useProvider(f);
  f.chat.setup(f.who, f.tenant.id, f.project.id, {
    tools: ['intervention.create'],
    enableCommands: true,
  });
  const key = hostCredential(f),
    host = { id: 'alpha', role: 'operator', permissions: ['customer.intervene'] },
    thread = f.chat.create(key.identity, f.tenant.id, f.project.id, {}, host);
  f.chat.turn(
    key.identity,
    f.tenant.id,
    f.project.id,
    thread.id,
    { message: 'Propose a check-in', requestId: 'command-test-request' },
    host,
  );
  await runJob(f, {
    apiFactory: model({
      ...empty,
      message: 'Proposal only.',
      toolCalls: [
        {
          capabilityId: 'intervention.create',
          inputJson: '{"customerId":"northstar","kind":"call","reason":"Follow up"}',
        },
      ],
    }),
  });
  const c = f.chat.read(key.identity, f.tenant.id, f.project.id, thread.id, host).pending[0];
  assert.throws(
    () => f.chat.leaseTool(key.identity, f.tenant.id, f.project.id, thread.id, c.id, {}, host),
    { code: 'CONFIRMATION_REQUIRED' },
  );
  f.chat.leaseTool(
    key.identity,
    f.tenant.id,
    f.project.id,
    thread.id,
    c.id,
    { confirmed: true, inputHash: c.inputHash },
    host,
  );
  f.db.run('UPDATE agent_calls SET lease_until=0 WHERE id=?', c.id);
  assert.throws(
    () =>
      f.chat.leaseTool(
        key.identity,
        f.tenant.id,
        f.project.id,
        thread.id,
        c.id,
        { confirmed: true, inputHash: c.inputHash },
        host,
      ),
    { code: 'ACTION_UNCERTAIN' },
  );
  assert.equal(f.db.get('SELECT status FROM agent_calls WHERE id=?', c.id).status, 'uncertain');
});
test('cancellation fences a pending turn and purge removes transcript and attachments', async (t) => {
  const f = await ready();
  t.after(() => f.db.close());
  f.chat.setup(f.who, f.tenant.id, f.project.id, { tools: [] });
  const x = f.chat.create(f.who, f.tenant.id, f.project.id, {});
  f.chat.attach(f.who, f.tenant.id, f.project.id, x.id, {
    name: 'note.txt',
    mediaType: 'text/plain',
    base64: Buffer.from('Private fixture note').toString('base64'),
  });
  f.chat.turn(f.who, f.tenant.id, f.project.id, x.id, {
    message: 'Hello',
    mode: 'demo',
    requestId: 'cancel-fixture-request',
  });
  f.chat.cancel(f.who, f.tenant.id, f.project.id, x.id);
  assert.equal(f.chat.read(f.who, f.tenant.id, f.project.id, x.id).activeJobId, null);
  f.chat.purge(f.who, f.tenant.id, f.project.id, x.id);
  assert.equal(f.db.get('SELECT count(*) n FROM agent_messages').n, 0);
  assert.equal(f.db.get('SELECT count(*) n FROM agent_attachments').n, 0);
  assert.throws(() => f.chat.read(f.who, f.tenant.id, f.project.id, x.id), { code: 'NOT_FOUND' });
});
test('component lifecycle uses distinct review, signature and revocation gates', async (t) => {
  const f = await ready();
  t.after(() => f.db.close());
  const c = await publish(f);
  const s = (await import('../../packages/control-plane/src/access.mjs')).projectAccess(
    f.db,
    f.who,
    f.tenant.id,
    f.project.id,
  );
  assert.equal(f.components.published(s, c.id).kit.id, 'delivery-board');
  f.components.revoke(f.who, f.tenant.id, f.project.id, c.id);
  assert.throws(() => f.components.published(s, c.id), { code: 'COMPONENT_UNAVAILABLE' });
});
