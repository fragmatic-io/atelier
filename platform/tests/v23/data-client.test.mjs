import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../../packages/conversation/src/calculator.mjs';
import { AgentClient } from '../../packages/conversation/src/client.mjs';
import { MemoryJournal } from '../../packages/conversation/src/journal.mjs';
import { observeClient, shapeOf } from '../../packages/conversation/src/observe.mjs';
test('calculation plans aggregate and sort actual supplied data', () => {
  const r = calculate(
    {
      source: 'rows',
      steps: [
        {
          op: 'group',
          by: ['team'],
          metrics: [
            { op: 'sum', field: 'score', as: 'sum' },
            { op: 'mean', field: 'score', as: 'mean' },
            { op: 'count', as: 'count' },
          ],
        },
        { op: 'sort', field: 'sum', direction: 'desc' },
      ],
    },
    {
      rows: [
        { team: 'a', score: 10 },
        { team: 'b', score: 20 },
        { team: 'a', score: 30 },
      ],
    },
  );
  assert.equal(r.rows[0].sum, 40);
  assert.equal(r.rows[0].mean, 20);
  assert.equal(r.rows[0].count, 2);
});
test('calculations reject unauthorized inputs, executable operations and prototype paths', () => {
  for (const plan of [
    { source: 'missing', steps: [] },
    { source: 'rows', steps: [{ op: 'eval', code: 'process.exit()' }] },
    { source: 'rows', steps: [{ op: 'select', fields: ['constructor.prototype'] }] },
    {
      source: 'rows',
      steps: [{ op: 'group', by: [], metrics: [{ op: 'sum', field: 'name', as: 'sum' }] }],
    },
  ])
    assert.throws(() => calculate(plan, { rows: [{ name: 'hello' }] }));
});
test('joins and number overflow are bounded', () => {
  assert.throws(() =>
    calculate(
      {
        source: 'a',
        steps: [{ op: 'join', source: 'b', leftKey: 'id', rightKey: 'id', as: 'right' }],
      },
      { a: [{ id: 1 }, { id: 1 }], b: [{ id: 1 }, { id: 1 }] },
      { maxRows: 3 },
    ),
  );
  assert.throws(() =>
    calculate(
      {
        source: 'a',
        steps: [{ op: 'group', by: [], metrics: [{ op: 'sum', field: 'n', as: 'total' }] }],
      },
      { a: [{ n: Number.MAX_VALUE }, { n: Number.MAX_VALUE }] },
    ),
  );
  const r = calculate(
    {
      source: 'a',
      steps: [
        { op: 'join', source: 'b', leftKey: 'id', rightKey: 'id', as: 'right', kind: 'left' },
      ],
    },
    { a: [{ id: null }], b: [{ id: null, name: 'not-a-match' }] },
  );
  assert.equal(r.rows[0].right, null);
});
test('transport failure keeps a stable outbox ID, not a new action', async () => {
  const journal = new MemoryJournal(),
    calls = [];
  let fail = true;
  const c = new AgentClient({
    journal,
    transport: async (x) => {
      calls.push(x);
      if (fail) throw new Error('offline');
      return { jobId: 'job', replayed: true };
    },
  });
  await assert.rejects(c.send('thread', 'Hello', { requestId: 'stable-request' }));
  fail = false;
  await c.retryOutbox();
  assert.equal(calls[0].input.requestId, calls[1].input.requestId);
  assert.equal((await journal.list()).length, 0);
  await c.close();
});
test('client read tool receipts do not duplicate the registered execution', async () => {
  let executions = 0;
  const c = new AgentClient({
    journal: new MemoryJournal(),
    tools: [{ name: 'local.read', execute: async () => ({ value: ++executions }) }],
    transport: async (x) =>
      x.action === 'client-lease' ? { leaseToken: 'proof', input: {} } : { accepted: true },
  });
  const call = { id: 'call', capabilityId: 'local.read' };
  await c.executeClientTool('thread', call);
  await c.executeClientTool('thread', call);
  assert.equal(executions, 1);
  await c.close();
});
test('observation does not capture values, secrets or modify the application response', async () => {
  let observed;
  const original = {
    name: 'Private Name',
    email: 'private@example.test',
    accessToken: 'never-capture',
  };
  const fn = observeClient(async () => original, {
    template: '/customers/:id',
    record: (x) => {
      observed = x;
    },
    enabled: true,
  });
  assert.equal(await fn({ id: 'real-id' }), original);
  await new Promise((r) => setTimeout(r, 0));
  assert(!JSON.stringify(observed).includes('Private Name'));
  assert(!JSON.stringify(observed).includes('private@example.test'));
  assert(!JSON.stringify(observed).includes('never-capture'));
  assert(!Object.hasOwn(shapeOf(original).properties, 'accessToken'));
});
