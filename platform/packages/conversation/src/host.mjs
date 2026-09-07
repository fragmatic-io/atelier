// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { assert, hash, canonical, noPrototypeKeys } from './common.mjs';
import { validateData } from '../../providers/src/data-schema.mjs';
import { projectResult } from './inventory.mjs';
export class SqliteToolReceipts {
  constructor(db) {
    this.db = db;
    db.exec(
      'CREATE TABLE IF NOT EXISTS atelier_agent_receipts(scope TEXT NOT NULL,call_id TEXT NOT NULL,hash TEXT NOT NULL,lease_json TEXT,state TEXT NOT NULL,result_json TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(scope,call_id)) STRICT',
    );
  }
  get(scope, key) {
    return this.db
      .prepare('SELECT * FROM atelier_agent_receipts WHERE scope=? AND call_id=?')
      .get(scope, key);
  }
  claim(scope, key, fingerprint) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO atelier_agent_receipts VALUES(?,?,?,NULL,'claimed',NULL,?)")
        .run(scope, key, fingerprint, Date.now()).changes === 1
    );
  }
  lease(scope, key, value) {
    this.db
      .prepare(
        "UPDATE atelier_agent_receipts SET lease_json=?,state='executing' WHERE scope=? AND call_id=? AND state='claimed'",
      )
      .run(JSON.stringify(value), scope, key);
  }
  result(scope, key, value) {
    this.db
      .prepare(
        "UPDATE atelier_agent_receipts SET state='complete',result_json=? WHERE scope=? AND call_id=?",
      )
      .run(JSON.stringify(value), scope, key);
  }
  forget(scope, key) {
    this.db
      .prepare("DELETE FROM atelier_agent_receipts WHERE scope=? AND call_id=? AND state='claimed'")
      .run(scope, key);
  }
}
export class AgentHostBridge {
  constructor({
    tenantId,
    projectId,
    origin,
    token,
    transport,
    authorize,
    loaders = {},
    executors = {},
    ledger,
    receipts,
    confirmationKey,
    clock = () => Date.now(),
    frameOrigin = null,
    timeoutMs = 15000,
    reconcile,
  }) {
    assert(
      tenantId &&
        projectId &&
        typeof authorize === 'function' &&
        ledger &&
        receipts &&
        Buffer.isBuffer(confirmationKey) &&
        confirmationKey.length >= 32,
      500,
      'AGENT_HOST_CONFIG',
      'Scoped authorization, durable ledgers and a 32-byte confirmation key are required',
    );
    Object.assign(this, {
      tenantId,
      projectId,
      origin,
      authorize,
      loaders,
      executors,
      ledger,
      receipts,
      confirmationKey,
      clock,
      frameOrigin,
      reconcile,
    });
    if (!transport) {
      const u = new URL(origin);
      assert(
        !u.username &&
          !u.password &&
          (u.protocol === 'https:' ||
            (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))),
        500,
        'HOST_ORIGIN',
        'Use HTTPS for a remote control plane',
      );
    }
    this.transport =
      transport ??
      (async (body) => {
        const res = await fetch(
          `${origin}/api/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/agent/rpc`,
          {
            method: 'POST',
            redirect: 'error',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
        const raw = await res.text();
        assert(raw.length < 4e6, 502, 'AGENT_RESPONSE_SIZE', 'Upstream result too large');
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          assert(false, 502, 'AGENT_UPSTREAM', 'Invalid upstream JSON');
        }
        assert(
          res.ok,
          res.status,
          value.error?.code ?? 'AGENT_UPSTREAM',
          value.error?.message ?? 'Upstream rejected the request',
        );
        return value;
      });
  }
  subject(s) {
    assert(
      s?.id &&
        s?.role &&
        Array.isArray(s.permissions) &&
        s.permissions.every((p) => typeof p === 'string'),
      401,
      'HOST_SUBJECT',
      'Use the authenticated host-server subject',
    );
    return { id: String(s.id), role: String(s.role), permissions: s.permissions };
  }
  async request(subject, action, input = {}) {
    assert(
      [
        'list',
        'create',
        'read',
        'turn',
        'events',
        'cancel',
        'archive',
        'purge',
        'artifact',
        'revise',
        'pin',
        'feedback',
        'attach',
        'artifact-action',
        'deny',
      ].includes(action),
      403,
      'HOST_OPERATION',
      'Use dedicated host methods for execution',
    );
    noPrototypeKeys(input);
    const result = await this.transport({
      ...input,
      action,
      host: this.subject(subject),
      frameOrigin: this.frameOrigin,
    });
    if (action === 'artifact' && result.preview?.url && this.origin)
      result.preview.url = new URL(result.preview.url, this.origin).href;
    return result;
  }
  async call(subject, threadId, callId) {
    const c = await this.transport({
      action: 'call',
      threadId,
      callId,
      host: this.subject(subject),
    });
    assert(
      c.contract?.securityReviewed && c.contract.id === c.capabilityId,
      403,
      'CALL_CONTRACT',
      'Tool contract is not reviewed',
    );
    assert(
      c.contract.requiredPermissions.every((p) => subject.permissions.includes(p)),
      403,
      'HOST_PERMISSION',
      'Current permissions deny this tool',
    );
    validateData(c.input, c.contract.inputSchema);
    assert(
      await this.authorize({
        subject,
        capability: c.contract,
        kind: c.contract.kind,
        input: c.input,
        context: c.context,
      }),
      403,
      'HOST_AUTHORIZATION',
      'Host object authorization denied',
    );
    return c;
  }
  binding(s, thread, c) {
    return {
      tenant: this.tenantId,
      project: this.projectId,
      subject: String(s.id),
      threadId: thread,
      callId: c.id,
      contractHash: c.contract.contractHash,
      inputHash: hash(c.input),
      contextHash: hash(c.context),
      permissionHash: c.permissionHash,
    };
  }
  mac(s) {
    return createHmac('sha256', this.confirmationKey).update(s).digest('base64url');
  }
  async confirm({ subject, threadId, callId }) {
    const c = await this.call(subject, threadId, callId);
    assert(
      c.contract.kind === 'command',
      400,
      'NOT_COMMAND',
      'A query needs no confirmation ticket',
    );
    const payload = Buffer.from(
      canonical({
        ...this.binding(subject, threadId, c),
        expiresAt: this.clock() + 120000,
        nonce: randomBytes(16).toString('base64url'),
      }),
    ).toString('base64url');
    return {
      ticket: payload + '.' + this.mac(payload),
      capability: c.capabilityId,
      risk: c.contract.risk,
      input: c.input,
      expiresIn: 120,
    };
  }
  async execute({ subject, threadId, callId, ticket, deny = false }) {
    const c = await this.call(subject, threadId, callId),
      binding = this.binding(subject, threadId, c),
      scope = hash({ tenant: this.tenantId, project: this.projectId, subject: subject.id }),
      fingerprint = hash(binding);
    const complete = (input) =>
      this.transport({ action: 'result', threadId, callId, input, host: this.subject(subject) });
    if (deny)
      return this.transport({ action: 'deny', threadId, callId, host: this.subject(subject) });
    const receipt = this.receipts.get(scope, c.id);
    if (receipt) {
      assert(
        receipt.hash === fingerprint,
        409,
        'RECEIPT_CONFLICT',
        'Current action context changed',
      );
      if (receipt.state === 'complete') return complete(JSON.parse(receipt.result_json));
      assert(
        false,
        409,
        'ACTION_UNCERTAIN',
        'Previous execution may have committed; reconcile the host operation before retrying',
      );
    }
    if (c.contract.kind === 'command') {
      assert(
        typeof ticket === 'string' && ticket.length < 12000,
        403,
        'CONFIRMATION_REQUIRED',
        'Explicit confirmation is required',
      );
      const [payload, signature, extra] = ticket.split('.'),
        expected = this.mac(payload ?? '');
      assert(
        !extra &&
          signature?.length === expected.length &&
          timingSafeEqual(Buffer.from(signature), Buffer.from(expected)),
        403,
        'CONFIRMATION_INVALID',
        'Invalid action confirmation',
      );
      let decoded;
      try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
      } catch {
        assert(false, 403, 'CONFIRMATION_INVALID', 'Invalid confirmation data');
      }
      assert(
        decoded.expiresAt >= this.clock(),
        403,
        'CONFIRMATION_EXPIRED',
        'Confirmation expired',
      );
      for (const [k, v] of Object.entries(binding))
        assert(
          decoded[k] === v,
          403,
          'CONFIRMATION_MISMATCH',
          'Action inputs, permissions or context changed',
        );
    }
    assert(
      c.contract.execution !== 'client',
      409,
      'CLIENT_TOOL',
      'This tool executes in the registered client',
    );
    const fn = (c.contract.kind === 'query' ? this.loaders : this.executors)[c.capabilityId];
    assert(typeof fn === 'function', 501, 'HOST_BINDING_REQUIRED', 'Register this host-owned tool');
    assert(
      this.receipts.claim(scope, c.id, fingerprint),
      409,
      'ACTION_IN_FLIGHT',
      'Another request owns this execution',
    );
    let lease;
    try {
      lease = await this.transport({
        action: 'lease',
        threadId,
        callId,
        input: { confirmed: c.contract.kind === 'command', inputHash: c.inputHash },
        host: this.subject(subject),
      });
    } catch (e) {
      if (e.status && e.status < 500) this.receipts.forget(scope, c.id);
      throw e;
    }
    this.receipts.lease(scope, c.id, lease);
    let outcome;
    try {
      const value =
        c.contract.kind === 'command'
          ? (
              await this.ledger.run(scope, lease.idempotencyKey, fingerprint, (operationId) =>
                fn({ subject, input: c.input, context: c.context, operationId }),
              )
            ).result
          : await fn({ subject, input: c.input, context: c.context });
      const result = projectResult(value, c.contract.outputSchema);
      validateData(result, c.contract.outputSchema);
      outcome = { leaseToken: lease.leaseToken, status: 'succeeded', result };
    } catch (error) {
      outcome = {
        leaseToken: lease.leaseToken,
        status: c.contract.kind === 'command' ? 'uncertain' : 'failed',
        code: error.code ?? 'HOST_EXECUTOR_FAILED',
      };
    }
    this.receipts.result(scope, c.id, outcome);
    return complete(outcome);
  }
  async clientLease({ subject, threadId, callId, confirmed = false, inputHash }) {
    const c = await this.call(subject, threadId, callId);
    assert(
      c.contract.execution === 'client',
      403,
      'CLIENT_TOOL_REQUIRED',
      'Only registered browser tools may execute in the client',
    );
    return this.transport({
      action: 'lease',
      threadId,
      callId,
      input: {
        confirmed: c.contract.kind === 'command' ? confirmed : false,
        inputHash: c.contract.kind === 'command' ? inputHash : undefined,
      },
      host: this.subject(subject),
    });
  }
  async clientResult({ subject, threadId, callId, leaseToken, result, error, uncertain }) {
    const c = await this.call(subject, threadId, callId);
    assert(
      c.contract.execution === 'client',
      403,
      'CLIENT_TOOL_REQUIRED',
      'Browser outputs are allowed only for registered client tools',
    );
    return this.transport({
      action: 'result',
      threadId,
      callId,
      input: {
        leaseToken,
        status: error ? (c.contract.kind === 'command' || uncertain ? 'uncertain' : 'failed') : 'succeeded',
        result,
        code: error ? 'CLIENT_TOOL_FAILED' : undefined,
      },
      host: this.subject(subject),
    });
  }
}
