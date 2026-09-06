// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Server-side bridge. The control-plane token and signing key never enter browser code. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { verifySignedBundle } from '../../runtime/src/index.mjs';
import { validateData } from '../../providers/src/data-schema.mjs';
import { assert, canonical, hash, noPrototypeKeys } from '../../control-plane/src/util.mjs';
/** Durable deduplication. An interrupted side-effect stays uncertain, never auto-replayed.
 * Executors must propagate operationId into the business system's idempotency mechanism. */
export class SqliteActionLedger {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS host_actions(scope TEXT NOT NULL,id TEXT NOT NULL,input_hash TEXT NOT NULL,status TEXT NOT NULL,result TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(scope,id)) STRICT;`);
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  async run(scope, key, payloadHash, fn) {
    assert(
      typeof key === 'string' && /^[a-zA-Z0-9_-]{16,160}$/.test(key),
      400,
      'IDEMPOTENCY_REQUIRED',
      'Use a stable random idempotency key for each intentional action',
    );
    this.db.exec('BEGIN IMMEDIATE');
    let old;
    try {
      old = this.db.prepare('SELECT * FROM host_actions WHERE scope=? AND id=?').get(scope, key);
      if (!old)
        this.db
          .prepare('INSERT INTO host_actions VALUES(?,?,?,?,?,?)')
          .run(scope, key, payloadHash, 'pending', null, Date.now());
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    if (old) {
      assert(
        old.input_hash === payloadHash,
        409,
        'IDEMPOTENCY_CONFLICT',
        'This key was used for a different action',
      );
      assert(
        old.status === 'succeeded',
        409,
        'ACTION_UNCERTAIN',
        'This action is in progress or its outcome is uncertain. Reconcile with the system of record; do not automatically retry.',
      );
      return { result: JSON.parse(old.result), replayed: true };
    }
    try {
      const result = await fn(hash({ scope, key }));
      assert(
        result !== undefined,
        500,
        'EXECUTOR_RESULT',
        'An executor must return a serializable result',
      );
      const encoded = JSON.stringify(result);
      assert(
        encoded.length <= 256 * 1024,
        500,
        'EXECUTOR_RESULT_SIZE',
        'Action result exceeds the ledger limit',
      );
      this.db
        .prepare("UPDATE host_actions SET status='succeeded',result=? WHERE scope=? AND id=?")
        .run(encoded, scope, key);
      return { result, replayed: false };
    } catch (e) {
      this.db
        .prepare("UPDATE host_actions SET status='uncertain' WHERE scope=? AND id=?")
        .run(scope, key);
      throw e;
    }
  }
  /** Operator-only reconciliation after checking the authoritative business system. */
  reconcile(scope, key, result) {
    const out = JSON.stringify(result);
    assert(
      out && out.length <= 256 * 1024,
      400,
      'RESULT_INVALID',
      'A bounded serializable result is required',
    );
    return (
      this.db
        .prepare(
          "UPDATE host_actions SET status='succeeded',result=? WHERE scope=? AND id=? AND status IN ('pending','uncertain')",
        )
        .run(out, scope, key).changes === 1
    );
  }
  close() {
    this.db.close();
  }
}
function safeProject(value, fields) {
  if (Array.isArray(value)) return value.slice(0, 1000).map((x) => safeProject(x, fields));
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const field of fields) {
    const parts = field.split('.');
    if (parts.some((p) => ['__proto__', 'constructor', 'prototype'].includes(p))) continue;
    let v = value,
      ok = true;
    for (const part of parts) {
      if (!v || typeof v !== 'object' || !Object.hasOwn(v, part)) {
        ok = false;
        break;
      }
      v = v[part];
    }
    if (ok) {
      let dest = out;
      for (const part of parts.slice(0, -1)) dest = dest[part] ??= Object.create(null);
      dest[parts.at(-1)] = v;
    }
  }
  return out;
}
export class HostBridge {
  constructor({
    tenantId,
    projectId,
    environment = 'production',
    origin,
    token,
    authorize,
    loaders = {},
    executors = {},
    confirmationKey,
    ledger,
    transport,
    clock = () => Date.now(),
    timeoutMs = 10000,
  }) {
    assert(
      tenantId && projectId && typeof authorize === 'function' && ledger,
      500,
      'HOST_CONFIG',
      'Host identity, authorization callback and durable action ledger are required',
    );
    assert(
      Buffer.isBuffer(confirmationKey) && confirmationKey.length >= 32,
      500,
      'HOST_KEY',
      'Use an independent >=32-byte host confirmation key',
    );
    if (!transport) {
      const u = new URL(origin);
      assert(
        u.protocol === 'https:' ||
          (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)),
        500,
        'HOST_ORIGIN',
        'Use HTTPS for a remote control plane',
      );
      assert(!u.username && !u.password, 500, 'HOST_ORIGIN', 'URL credentials are forbidden');
    }
    Object.assign(this, {
      tenantId,
      projectId,
      environment,
      origin,
      token,
      authorize,
      loaders,
      executors,
      confirmationKey,
      ledger,
      clock,
      timeoutMs,
    });
    this.transport =
      transport ??
      (async (input) => {
        const resp = await fetch(
          `${origin}/api/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/resolve`,
          {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'error',
          },
        );
        assert(
          resp.ok,
          503,
          'CONTROL_PLANE_UNAVAILABLE',
          'Could not authorize the current published surface',
        );
        const text = await resp.text();
        assert(
          text.length <= 12 * 1024 * 1024,
          503,
          'BUNDLE_TOO_LARGE',
          'Control plane response is oversized',
        );
        return JSON.parse(text);
      });
  }
  identity(subject) {
    assert(
      subject?.id && subject.role && Array.isArray(subject.permissions),
      401,
      'HOST_IDENTITY',
      'The host must supply its authenticated server-side identity',
    );
    return {
      subject: String(subject.id),
      role: String(subject.role),
      permissions: subject.permissions,
    };
  }
  async resolve(subject, slotId, context = {}) {
    noPrototypeKeys(context);
    const result = await this.transport({
      ...this.identity(subject),
      slotId,
      environment: this.environment,
    });
    if (!result.bundle) return result;
    const b = result.bundle;
    verifySignedBundle(b, result.publicKeys);
    assert(
      b.tenantId === this.tenantId &&
        b.projectId === this.projectId &&
        b.slotId === slotId &&
        b.environment === this.environment,
      403,
      'HOST_SCOPE',
      'Signed surface belongs to a different tenant, project, environment or slot',
    );
    assert(
      !b.activation?.role || b.activation.role === subject.role,
      403,
      'HOST_ROLE',
      'The surface is not approved for this role',
    );
    return result;
  }
  async contract(subject, slotId, releaseId, capability, kind, context, input = {}) {
    const { bundle } = await this.resolve(subject, slotId, context);
    assert(
      bundle && bundle.releaseId === releaseId,
      409,
      'SURFACE_CHANGED',
      'This surface changed. Refresh before continuing',
    );
    const c = (kind === 'query' ? bundle.dataContracts : bundle.actionContracts)?.find(
      (x) => x.id === capability,
    );
    assert(c, 403, 'CAPABILITY_DENIED', 'This capability is not part of the approved surface');
    assert(
      (c.requiredPermissions ?? []).every((p) => subject.permissions.includes(p)),
      403,
      'HOST_PERMISSION',
      'The authenticated user lacks a required permission',
    );
    validateData(input, c.inputSchema);
    assert(
      await this.authorize({ subject, capability: c, kind, context, input }),
      403,
      'HOST_AUTHORIZATION',
      'The host rejected this operation for the selected entity',
    );
    return { bundle, contract: c };
  }
  async load({ subject, slotId, releaseId, capability, input = {}, context = {} }) {
    const { contract } = await this.contract(
      subject,
      slotId,
      releaseId,
      capability,
      'query',
      context,
      input,
    );
    validateData(input, contract.inputSchema);
    assert(
      typeof this.loaders[capability] === 'function',
      501,
      'LOADER_REQUIRED',
      'Register a host-owned loader',
    );
    const value = await this.loaders[capability]({ subject, input, context });
    validateData(value, contract.outputSchema);
    const projected = safeProject(value, contract.fields ?? []),
      allowed = new Set(contract.fields ?? []),
      sensitive = new Set(contract.piiFields ?? []);
    const redact = (v, prefix = '') => {
      if (Array.isArray(v)) return v.map((x) => redact(x, prefix));
      if (!v || typeof v !== 'object') return v;
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => {
            const path = prefix ? prefix + '.' + k : k;
            return !(sensitive.has(k) || sensitive.has(path)) || allowed.has(path);
          })
          .map(([k, x]) => [k, redact(x, prefix ? prefix + '.' + k : k)]),
      );
    };
    return redact(projected);
  }
  binding({ subject, slotId, releaseId, capability, input, context }) {
    return {
      tenantId: this.tenantId,
      projectId: this.projectId,
      environment: this.environment,
      subjectId: String(subject.id),
      slotId,
      releaseId,
      capability,
      inputHash: hash(input),
      contextHash: hash(context ?? {}),
    };
  }
  mac(payload) {
    return createHmac('sha256', this.confirmationKey).update(payload).digest('base64url');
  }
  async confirm(args) {
    const { contract } = await this.contract(
      args.subject,
      args.slotId,
      args.releaseId,
      args.capability,
      'command',
      args.context,
      args.input,
    );
    validateData(args.input, contract.inputSchema);
    assert(
      contract.securityReviewed,
      403,
      'UNREVIEWED_COMMAND',
      'This command needs developer review',
    );
    const payload = Buffer.from(
      canonical({
        ...this.binding(args),
        expiresAt: this.clock() + 120000,
        nonce: randomBytes(16).toString('base64url'),
      }),
    ).toString('base64url');
    return {
      ticket: `${payload}.${this.mac(payload)}`,
      expiresIn: 120,
      risk: contract.risk,
      confirmation: contract.confirmation,
    };
  }
  async dispatch(args) {
    noPrototypeKeys(args.input);
    const { contract } = await this.contract(
      args.subject,
      args.slotId,
      args.releaseId,
      args.capability,
      'command',
      args.context,
      args.input,
    );
    validateData(args.input, contract.inputSchema);
    assert(
      contract.securityReviewed,
      403,
      'UNREVIEWED_COMMAND',
      'This command needs developer review',
    );
    assert(
      typeof this.executors[args.capability] === 'function',
      501,
      'EXECUTOR_REQUIRED',
      'Register a host-owned executor',
    );
    const ticket = String(args.ticket ?? '');
    assert(ticket.length < 12000, 400, 'CONFIRMATION_INVALID', 'Confirmation ticket is oversized');
    const [payload, signature] = ticket.split('.');
    const mac = payload ? this.mac(payload) : '';
    assert(
      signature &&
        signature.length === mac.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(mac)),
      403,
      'CONFIRMATION_INVALID',
      'The confirmation ticket is invalid',
    );
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      assert(false, 403, 'CONFIRMATION_INVALID', 'Malformed confirmation');
    }
    assert(parsed.expiresAt >= this.clock(), 403, 'CONFIRMATION_EXPIRED', 'Confirmation expired');
    for (const [k, v] of Object.entries(this.binding(args)))
      assert(
        parsed[k] === v,
        403,
        'CONFIRMATION_MISMATCH',
        'The action changed after confirmation',
      );
    const scope = hash({
      tenant: this.tenantId,
      project: this.projectId,
      subject: args.subject.id,
    });
    // The ticket nonce is the durable idempotency key. Repeated delivery cannot run twice.
    return this.ledger.run(scope, parsed.nonce, hash(this.binding(args)), (operationId) =>
      this.executors[args.capability]({
        subject: args.subject,
        input: args.input,
        context: args.context,
        operationId,
      }),
    );
  }
}
