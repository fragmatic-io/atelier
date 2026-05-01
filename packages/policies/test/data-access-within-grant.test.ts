import { describe, expect, it } from 'vitest';
import { dataAccessWithinGrant } from '../src/baseline/data_access_within_grant.js';
import { baselineContext } from './fixtures/manifest.js';

describe('data_access_within_grant', () => {
  it('passes when every projected field falls under the user grant', () => {
    const ctx = baselineContext();
    const result = dataAccessWithinGrant.evaluate(ctx);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('passes when the wildcard `*` grant is present', () => {
    const ctx = baselineContext();
    ctx.intent.granted_fields = ['*'];
    const result = dataAccessWithinGrant.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('passes when an exact dotted grant covers a field', () => {
    const ctx = baselineContext();
    ctx.intent.granted_fields = [
      'thread.list.id',
      'thread.list.subject',
      'thread.list.sender',
      'task.list.id',
      'task.list.title',
      'task.list.due_date',
    ];
    const result = dataAccessWithinGrant.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('flags a binding to an unresolved capability', () => {
    const ctx = baselineContext();
    delete ctx.capabilities['thread.list'];
    const result = dataAccessWithinGrant.evaluate(ctx);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.message.includes('unresolved capability'));
    expect(v).toBeDefined();
    expect(v?.path).toBe('/routes/1/layout/children/0/data/source');
  });

  it('flags fields outside the grant', () => {
    const ctx = baselineContext();
    ctx.intent.granted_fields = ['thread.list.id', 'task.list.*'];
    const result = dataAccessWithinGrant.evaluate(ctx);
    expect(result.ok).toBe(false);
    // thread.list projects subject and sender → 2 violations on the same node
    const subjectV = result.violations.find((v) => v.message.includes('thread.list.subject'));
    const senderV = result.violations.find((v) => v.message.includes('thread.list.sender'));
    expect(subjectV).toBeDefined();
    expect(senderV).toBeDefined();
    expect(subjectV?.path).toBe('/routes/1/layout/children/0/data/source');
  });
});
