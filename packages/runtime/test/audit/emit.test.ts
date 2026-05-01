import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '@cir/schemas';
import { ConsoleAuditSink, NoopAuditSink } from '../../src/audit/emit.js';

const event: AuditEvent = {
  event_id: 'evt_abc123',
  timestamp: '2026-04-29T12:00:00Z',
  user_id: 'vid',
  app_id: 'mail.example.com',
  type: 'manifest.served',
  actor: 'system',
  before_state_hash: '',
  after_state_hash: 'm_8f3a2b1c',
  trigger_chain: ['route:/today'],
  token_cost: 0,
  policy_evaluations: [],
  manifest_id: 'm_8f3a2b1c',
};

describe('NoopAuditSink', () => {
  it('does not throw and returns undefined', () => {
    expect(NoopAuditSink.emit(event)).toBeUndefined();
  });
});

describe('ConsoleAuditSink', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('writes a JSON line containing the event to console.warn', () => {
    const sink = new ConsoleAuditSink();
    sink.emit(event);
    expect(warn).toHaveBeenCalledOnce();
    const call = warn.mock.calls[0]?.[0] as string;
    expect(call).toContain('[audit]');
    expect(call).toContain('"manifest.served"');
    expect(call).toContain('"m_8f3a2b1c"');
  });
});
