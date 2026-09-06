// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { requireScope } from './access.mjs';
import { assert, canonical, hash, id, parseJson, sanitizeMetadata } from './util.mjs';
export class Store {
  constructor(db, { clock = () => Date.now() } = {}) {
    this.db = db;
    this.clock = clock;
  }
  audit(
    { tenantId, projectId = null, userId = 'system' },
    action,
    resourceId = null,
    details = {},
  ) {
    return this.db.transaction(() => {
      const t = this.db.get('SELECT audit_head FROM tenants WHERE id=?', tenantId);
      assert(t, 404, 'NOT_FOUND', 'Workspace not found');
      const last = this.db.get(
        'SELECT seq FROM audit WHERE tenant_id=? ORDER BY seq DESC LIMIT 1',
        tenantId,
      );
      const record = {
        tenantId,
        seq: (last?.seq ?? 0) + 1,
        id: id('aud'),
        projectId,
        actorId: userId,
        action,
        resourceId,
        details: sanitizeMetadata(details),
        createdAt: this.clock(),
        prevHash: t.audit_head,
      };
      const digest = hash(record);
      this.db.run(
        'INSERT INTO audit VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        tenantId,
        record.seq,
        record.id,
        projectId,
        userId,
        action,
        resourceId,
        JSON.stringify(record.details),
        record.createdAt,
        record.prevHash,
        digest,
      );
      this.db.run('UPDATE tenants SET audit_head=? WHERE id=?', digest, tenantId);
      return { ...record, rowHash: digest };
    });
  }
  verifyAudit(tenantId) {
    let previous = '';
    let seq = 0;
    for (const r of this.db.all('SELECT * FROM audit WHERE tenant_id=? ORDER BY seq', tenantId)) {
      const body = {
        tenantId: r.tenant_id,
        seq: r.seq,
        id: r.id,
        projectId: r.project_id,
        actorId: r.actor_id,
        action: r.action,
        resourceId: r.resource_id,
        details: parseJson(r.details_json, {}),
        createdAt: r.created_at,
        prevHash: r.prev_hash,
      };
      if (r.seq !== ++seq || r.prev_hash !== previous || hash(body) !== r.row_hash)
        return { valid: false, at: r.seq };
      previous = r.row_hash;
    }
    return {
      valid:
        previous ===
        (this.db.get('SELECT audit_head FROM tenants WHERE id=?', tenantId)?.audit_head ?? ''),
      entries: seq,
      head: previous,
    };
  }
  artifact(scope, kind, content) {
    const s = requireScope(scope);
    const contentJson = canonical(content);
    assert(
      Buffer.byteLength(contentJson) <= 12 * 1024 * 1024,
      413,
      'ARTIFACT_TOO_LARGE',
      'Artifact exceeds 12 MB',
    );
    const digest = hash(contentJson),
      artifactId = `art_${hash({ kind, digest }).slice(0, 40)}`;
    this.db.run(
      'INSERT OR IGNORE INTO artifacts VALUES(?,?,?,?,?,?,?,?)',
      s.tenantId,
      s.projectId,
      artifactId,
      kind,
      contentJson,
      digest,
      s.userId,
      this.clock(),
    );
    return { id: artifactId, kind, hash: digest, content };
  }
  getArtifact(scope, artifactId, kind = null) {
    const s = requireScope(scope);
    const row = this.db.get(
      'SELECT * FROM artifacts WHERE tenant_id=? AND project_id=? AND id=?',
      s.tenantId,
      s.projectId,
      artifactId,
    );
    assert(row && (!kind || row.kind === kind), 404, 'NOT_FOUND', 'Artifact not found');
    assert(
      hash(row.content_json) === row.content_hash,
      500,
      'ARTIFACT_CORRUPT',
      'Artifact integrity verification failed',
    );
    return { ...row, content: JSON.parse(row.content_json) };
  }
  listArtifacts(scope, kind, limit = 100) {
    const s = requireScope(scope);
    return this.db.all(
      'SELECT id,kind,content_hash,created_at,created_by FROM artifacts WHERE tenant_id=? AND project_id=? AND kind=? ORDER BY created_at DESC,id LIMIT ?',
      s.tenantId,
      s.projectId,
      kind,
      limit,
    );
  }
  enqueue(scope, kind, input, { dedupeKey = id('request'), maxAttempts = 2 } = {}) {
    const s = requireScope(scope);
    return this.db.transaction(() => {
      const existing = this.db.get(
        'SELECT * FROM jobs WHERE tenant_id=? AND project_id=? AND dedupe_key=?',
        s.tenantId,
        s.projectId,
        dedupeKey,
      );
      if (existing) {
        assert(
          existing.kind === kind && hash(parseJson(existing.input_json)) === hash(input),
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request key was used with different input',
        );
        return existing;
      }
      const active = this.db.get(
        "SELECT count(*) n FROM jobs WHERE tenant_id=? AND status IN ('queued','running')",
        s.tenantId,
      ).n;
      assert(active < 40, 429, 'JOB_QUOTA', 'This workspace already has 40 active jobs');
      const now = this.clock(),
        jobId = id('job');
      this.db.run(
        'INSERT INTO jobs(tenant_id,project_id,id,kind,status,input_json,created_by,created_at,updated_at,dedupe_key,max_attempts) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        s.tenantId,
        s.projectId,
        jobId,
        kind,
        'queued',
        JSON.stringify(input),
        s.userId,
        now,
        now,
        dedupeKey,
        maxAttempts,
      );
      this.audit(s, 'job.queued', jobId, { kind });
      return this.db.get(
        'SELECT * FROM jobs WHERE tenant_id=? AND project_id=? AND id=?',
        s.tenantId,
        s.projectId,
        jobId,
      );
    });
  }
  job(scope, jobId) {
    const s = requireScope(scope);
    const j = this.db.get(
      'SELECT * FROM jobs WHERE tenant_id=? AND project_id=? AND id=?',
      s.tenantId,
      s.projectId,
      jobId,
    );
    assert(j, 404, 'NOT_FOUND', 'Job not found');
    return j;
  }
  cancel(scope, jobId) {
    const s = requireScope(scope);
    const j = this.job(s, jobId);
    assert(
      ['queued', 'running'].includes(j.status),
      409,
      'JOB_TERMINAL',
      'The job has already finished',
    );
    this.db.transaction(() => {
      this.db.run(
        "UPDATE jobs SET cancel_requested=1,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,updated_at=? WHERE tenant_id=? AND project_id=? AND id=?",
        this.clock(),
        s.tenantId,
        s.projectId,
        jobId,
      );
      this.db.run(
        "UPDATE inference_tasks SET status='cancelled' WHERE tenant_id=? AND project_id=? AND job_id=? AND status IN ('queued','running')",
        s.tenantId,
        s.projectId,
        jobId,
      );
      this.audit(s, 'job.cancel_requested', jobId);
    });
    return { cancelled: true };
  }
  claim(workerId, { leaseMs = 60000, maxPerTenant = 2 } = {}) {
    return this.db.transaction(() => {
      const now = this.clock();
      this.db.run(
        "UPDATE jobs SET status='cancelled',completed_at=?,updated_at=? WHERE cancel_requested=1 AND (status='queued' OR (status='running' AND lease_until<?))",
        now,
        now,
        now,
      );
      this.db.run(
        "UPDATE jobs SET status='failed',error_json=?,completed_at=?,updated_at=? WHERE status='running' AND lease_until<? AND attempts>=max_attempts",
        JSON.stringify({
          code: 'LEASE_EXHAUSTED',
          message: 'Worker lease expired after the retry limit',
        }),
        now,
        now,
        now,
      );
      const candidates = this.db.all(
        "SELECT j.* FROM jobs j JOIN projects p ON p.tenant_id=j.tenant_id AND p.id=j.project_id JOIN tenants t ON t.id=j.tenant_id WHERE ((j.status='queued') OR (j.status='running' AND j.lease_until<? AND j.attempts<j.max_attempts)) AND j.cancel_requested=0 AND p.archived_at IS NULL AND t.deleted_at IS NULL ORDER BY j.created_at,j.id LIMIT 200",
        now,
      );
      const job = candidates.find(
        (j) =>
          this.db.get(
            "SELECT count(*) n FROM jobs WHERE tenant_id=? AND status='running' AND lease_until>?",
            j.tenant_id,
            now,
          ).n < maxPerTenant,
      );
      if (!job) return null;
      this.db.run(
        "UPDATE jobs SET status='running',stage='starting',attempts=attempts+1,lease_owner=?,lease_until=?,fence=fence+1,started_at=COALESCE(started_at,?),updated_at=? WHERE tenant_id=? AND project_id=? AND id=?",
        workerId,
        now + leaseMs,
        now,
        now,
        job.tenant_id,
        job.project_id,
        job.id,
      );
      return this.db.get(
        'SELECT * FROM jobs WHERE tenant_id=? AND project_id=? AND id=?',
        job.tenant_id,
        job.project_id,
        job.id,
      );
    });
  }
  heartbeat(job, leaseMs = 60000) {
    const result = this.db.run(
      "UPDATE jobs SET lease_until=?,updated_at=? WHERE tenant_id=? AND project_id=? AND id=? AND status='running' AND lease_owner=? AND fence=? AND lease_until>? AND cancel_requested=0",
      this.clock() + leaseMs,
      this.clock(),
      job.tenant_id,
      job.project_id,
      job.id,
      job.lease_owner,
      job.fence,
      this.clock(),
    );
    return result.changes === 1;
  }
  progress(job, stage, details = {}) {
    const current = this.db.get(
      "SELECT trace_json FROM jobs WHERE tenant_id=? AND project_id=? AND id=? AND status='running' AND fence=? AND lease_owner=? AND lease_until>? AND cancel_requested=0",
      job.tenant_id,
      job.project_id,
      job.id,
      job.fence,
      job.lease_owner,
      this.clock(),
    );
    assert(current, 409, 'LEASE_LOST', 'Job cancelled or the worker no longer owns its lease');
    const trace = parseJson(current.trace_json, []);
    trace.push({ stage, at: this.clock(), ...sanitizeMetadata(details) });
    this.db.run(
      'UPDATE jobs SET stage=?,trace_json=?,updated_at=? WHERE tenant_id=? AND project_id=? AND id=? AND fence=?',
      stage,
      JSON.stringify(trace.slice(-200)),
      this.clock(),
      job.tenant_id,
      job.project_id,
      job.id,
      job.fence,
    );
  }
  finish(job, result, error = null) {
    const current = this.db.get(
      "SELECT * FROM jobs WHERE tenant_id=? AND project_id=? AND id=? AND status='running' AND fence=? AND lease_owner=? AND lease_until>?",
      job.tenant_id,
      job.project_id,
      job.id,
      job.fence,
      job.lease_owner,
      this.clock(),
    );
    if (!current) return false;
    const status = current.cancel_requested ? 'cancelled' : error ? 'failed' : 'succeeded';
    this.db.transaction(() => {
      this.db.run(
        'UPDATE jobs SET status=?,stage=?,result_json=?,error_json=?,completed_at=?,updated_at=?,lease_until=NULL WHERE tenant_id=? AND project_id=? AND id=? AND fence=?',
        status,
        status,
        result ? JSON.stringify(result) : null,
        error ? JSON.stringify(error) : null,
        this.clock(),
        this.clock(),
        job.tenant_id,
        job.project_id,
        job.id,
        job.fence,
      );
      this.audit(
        { tenantId: job.tenant_id, projectId: job.project_id, userId: job.created_by },
        `job.${status}`,
        job.id,
        { kind: job.kind, errorCode: error?.code },
      );
    });
    return true;
  }
  reserve(scope, amount) {
    const s = requireScope(scope),
      day = new Date(this.clock()).toISOString().slice(0, 10);
    return this.db.transaction(() => {
      const t = this.db.get('SELECT daily_token_limit FROM tenants WHERE id=?', s.tenantId);
      const used = this.db.get(
        'SELECT COALESCE(sum(input_tokens+output_tokens+reserved_tokens),0) n FROM usage WHERE tenant_id=? AND day=?',
        s.tenantId,
        day,
      ).n;
      assert(
        used + amount <= t.daily_token_limit,
        429,
        'TOKEN_BUDGET',
        'The workspace daily token budget would be exceeded',
      );
      this.db.run(
        'INSERT OR IGNORE INTO usage(tenant_id,project_id,day) VALUES(?,?,?)',
        s.tenantId,
        s.projectId,
        day,
      );
      this.db.run(
        'UPDATE usage SET reserved_tokens=reserved_tokens+? WHERE tenant_id=? AND project_id=? AND day=?',
        amount,
        s.tenantId,
        s.projectId,
        day,
      );
      const reservation = id('res');
      this.db.run(
        'INSERT INTO reservations VALUES(?,?,?,?,?,?,?)',
        s.tenantId,
        s.projectId,
        reservation,
        day,
        amount,
        null,
        this.clock(),
      );
      return reservation;
    });
  }
  settle(scope, reservation, usage = {}) {
    const s = requireScope(scope);
    return this.db.transaction(() => {
      const r = this.db.get(
        'SELECT * FROM reservations WHERE tenant_id=? AND project_id=? AND id=?',
        s.tenantId,
        s.projectId,
        reservation,
      );
      assert(r, 404, 'NOT_FOUND', 'Reservation not found');
      if (r.settled_at) return;
      const known = Number.isFinite(usage.inputTokens) && Number.isFinite(usage.outputTokens);
      const input = known ? Math.max(0, Math.ceil(usage.inputTokens)) : r.amount;
      const output = known ? Math.max(0, Math.ceil(usage.outputTokens)) : 0;
      this.db.run(
        'UPDATE usage SET reserved_tokens=MAX(0,reserved_tokens-?),input_tokens=input_tokens+?,output_tokens=output_tokens+?,calls=calls+1,unknown_usage_calls=unknown_usage_calls+? WHERE tenant_id=? AND project_id=? AND day=?',
        r.amount,
        input,
        output,
        known ? 0 : 1,
        s.tenantId,
        s.projectId,
        r.day,
      );
      this.db.run(
        'UPDATE reservations SET settled_at=? WHERE tenant_id=? AND project_id=? AND id=?',
        this.clock(),
        s.tenantId,
        s.projectId,
        reservation,
      );
    });
  }
  cacheGet(scope, key) {
    const s = requireScope(scope);
    const r = this.db.get(
      'SELECT result_json FROM model_cache WHERE tenant_id=? AND project_id=? AND cache_key=? AND expires_at>?',
      s.tenantId,
      s.projectId,
      key,
      this.clock(),
    );
    if (!r) return null;
    const day = new Date(this.clock()).toISOString().slice(0, 10);
    this.db.run(
      'INSERT OR IGNORE INTO usage(tenant_id,project_id,day) VALUES(?,?,?)',
      s.tenantId,
      s.projectId,
      day,
    );
    this.db.run(
      'UPDATE usage SET cache_hits=cache_hits+1 WHERE tenant_id=? AND project_id=? AND day=?',
      s.tenantId,
      s.projectId,
      day,
    );
    return JSON.parse(r.result_json);
  }
  cacheSet(scope, key, result, ttlMs = 7 * 86400000) {
    const s = requireScope(scope);
    this.db.run(
      'INSERT OR REPLACE INTO model_cache VALUES(?,?,?,?,?,?)',
      s.tenantId,
      s.projectId,
      key,
      JSON.stringify(result),
      this.clock() + ttlMs,
      this.clock(),
    );
    this.db.run(
      'DELETE FROM model_cache WHERE tenant_id=? AND project_id=? AND cache_key NOT IN (SELECT cache_key FROM model_cache WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC LIMIT 1000)',
      s.tenantId,
      s.projectId,
      s.tenantId,
      s.projectId,
    );
  }
  cleanup({ telemetryDays = 30 } = {}) {
    const now = this.clock();
    this.db.transaction(() => {
      for (const r of this.db.all(
        'SELECT * FROM reservations WHERE settled_at IS NULL AND created_at<?',
        now - 30 * 60000,
      )) {
        this.db.run(
          'UPDATE usage SET reserved_tokens=MAX(0,reserved_tokens-?),input_tokens=input_tokens+?,calls=calls+1,unknown_usage_calls=unknown_usage_calls+1 WHERE tenant_id=? AND project_id=? AND day=?',
          r.amount,
          r.amount,
          r.tenant_id,
          r.project_id,
          r.day,
        );
        this.db.run(
          'UPDATE reservations SET settled_at=? WHERE tenant_id=? AND project_id=? AND id=?',
          now,
          r.tenant_id,
          r.project_id,
          r.id,
        );
      }
      this.db.run('DELETE FROM sessions WHERE expires_at<? OR last_seen<?', now, now - 86400000);
      this.db.run('DELETE FROM rate_limits WHERE reset_at<?', now);
      this.db.run('DELETE FROM model_cache WHERE expires_at<?', now);
      this.db.run('DELETE FROM idempotency WHERE expires_at<?', now);
      this.db.run('DELETE FROM telemetry WHERE received_at<?', now - telemetryDays * 86400000);
      this.db.run(
        "UPDATE inference_tasks SET status='failed',error_json=? WHERE expires_at<? AND status IN ('queued','running')",
        JSON.stringify({ code: 'RUNNER_TIMEOUT', message: 'Runner task expired' }),
        now,
      );
    });
  }
}
