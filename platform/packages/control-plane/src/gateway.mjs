// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { ApiProvider, DEFAULT_HOSTS } from '../../providers/src/api.mjs';
import { ProviderError } from '../../providers/src/http.mjs';
import { validateOutput, checkSchema } from '../../providers/src/schema.mjs';
import { requireScope } from './access.mjs';
import { assert, hash, id, parseJson, sleep } from './util.mjs';
/** All model calls go through the same scoped budget/cache/trace boundary. */
export class ModelGateway {
  constructor({
    db,
    store,
    box,
    scope,
    job,
    allowedHosts = DEFAULT_HOSTS,
    apiFactory = (config) => new ApiProvider(config),
    clock = () => Date.now(),
  }) {
    Object.assign(this, {
      db,
      store,
      box,
      scope: requireScope(scope),
      job,
      allowedHosts,
      apiFactory,
      clock,
    });
    this.inFlight = new Map();
    this.id = 'atelier-model-gateway';
  }
  connection(stage) {
    const p = this.db.get(
      'SELECT * FROM projects WHERE tenant_id=? AND id=? AND archived_at IS NULL',
      this.scope.tenantId,
      this.scope.projectId,
    );
    assert(p, 404, 'PROJECT_ARCHIVED', 'Project is unavailable');
    const routing = parseJson(p.settings_json, {}).modelRouting?.[stage];
    const connectionId = routing?.connectionId ?? p.provider_id;
    const c = this.db.get(
      'SELECT * FROM connections WHERE tenant_id=? AND id=? AND revoked_at IS NULL',
      this.scope.tenantId,
      connectionId ?? '',
    );
    assert(
      c && (!c.project_id || c.project_id === this.scope.projectId),
      409,
      'PROVIDER_UNAVAILABLE',
      'Configure an active, scoped model connection',
    );
    const config = parseJson(c.config_json, {});
    return {
      connection: c,
      config,
      model: routing?.model ?? p.model_name ?? config.model,
      effort: config.effort,
    };
  }
  async generate({
    stage = 'designer',
    system,
    input,
    schema,
    signal,
    maxOutputTokens = 5000,
    images = [],
    cache = true,
  }) {
    checkSchema(schema);
    const { connection: c, config, model, effort } = this.connection(stage);
    const key = hash({
      v: 3,
      tenant: this.scope.tenantId,
      project: this.scope.projectId,
      connection: c.id,
      updated: c.updated_at,
      model,
      effort,
      system,
      input,
      schema,
      images: images.map((x) => hash(x.dataUrl)),
    });
    const cached = cache ? this.store.cacheGet(this.scope, key) : null;
    if (cached) {
      validateOutput(cached.value, schema);
      return { ...cached, cacheHit: true };
    }
    if (cache && this.inFlight.has(key)) return this.inFlight.get(key);
    const work = this.call({
      c,
      config,
      model,
      effort,
      stage,
      system,
      input,
      schema,
      signal,
      maxOutputTokens,
      images,
      key,
      cache,
    }).finally(() => this.inFlight.delete(key));
    if (cache) if (cache) this.inFlight.set(key, work);
    return work;
  }
  async call({
    c,
    config,
    model,
    effort,
    stage,
    system,
    input,
    schema,
    signal,
    maxOutputTokens,
    images,
    key,
    cache,
  }) {
    // UTF-8 bytes conservatively upper-bound text token estimates. Image token costs
    // differ by model; use a conservative allowance per reference, never claim $ cost.
    const reserve =
      Buffer.byteLength(system) +
      Buffer.byteLength(JSON.stringify(input)) +
      Buffer.byteLength(JSON.stringify(schema)) +
      maxOutputTokens +
      images.length * 6000;
    let final;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw new ProviderError('ABORTED', 'Build cancelled');
      // Recheck revocation before each request rather than trusting a stale config object.
      assert(
        this.db.get(
          'SELECT 1 FROM connections WHERE tenant_id=? AND id=? AND revoked_at IS NULL',
          this.scope.tenantId,
          c.id,
        ),
        409,
        'PROVIDER_REVOKED',
        'Provider was revoked',
      );
      const reservation = this.store.reserve(this.scope, reserve);
      let result;
      try {
        if (c.kind.endsWith('-cli'))
          result = await this.remoteRunner({
            kind: c.kind,
            runnerId: config.runnerId,
            model,
            effort,
            system,
            input,
            schema,
            signal,
            maxOutputTokens,
            images,
          });
        else {
          const provider = this.apiFactory({
            kind: c.kind,
            key: this.box.open(c.secret_cipher, `tenant:${this.scope.tenantId}:connection:${c.id}`),
            model,
            baseUrl: config.baseUrl,
            allowedHosts: this.allowedHosts,
          });
          result = await provider.generate({
            system,
            input,
            schema,
            signal,
            maxOutputTokens,
            images,
          });
        }
        validateOutput(result.value, schema);
        this.store.settle(this.scope, reservation, result.usage ?? {});
        if (cache) if (cache) this.store.cacheSet(this.scope, key, result);
        this.store.audit(this.scope, 'model.completed', this.job?.id ?? null, {
          stage,
          provider: c.kind,
          model,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          durationMs: result.durationMs,
          attempt,
        });
        return { ...result, cacheHit: false };
      } catch (err) {
        // Unknown/in-flight calls remain conservatively charged; errors rejected before
        // transport send (configuration, egress, cancellation) release the reservation.
        this.store.settle(
          this.scope,
          reservation,
          err.sent === false ? { inputTokens: 0, outputTokens: 0 } : {},
        );
        final = err;
        this.store.audit(this.scope, 'model.failed', this.job?.id ?? null, {
          stage,
          provider: c.kind,
          errorCode: err.code ?? 'MODEL_ERROR',
          attempt,
        });
        if (!err.retryable || attempt === 1) throw err;
        await sleep(
          Math.min(10000, err.retryAfterMs || 400 * 2 ** attempt + Math.floor(Math.random() * 200)),
          signal,
        );
      }
    }
    throw final;
  }
  async remoteRunner({
    kind,
    runnerId,
    model,
    effort,
    system,
    input,
    schema,
    signal,
    maxOutputTokens,
    images,
  }) {
    assert(this.job, 500, 'JOB_REQUIRED', 'Remote inference requires a durable parent job');
    const s = this.scope;
    const runner = this.db.get(
      'SELECT * FROM runners WHERE tenant_id=? AND project_id=? AND id=? AND revoked_at IS NULL',
      s.tenantId,
      s.projectId,
      runnerId,
    );
    assert(
      runner && parseJson(runner.providers_json, []).includes(kind),
      409,
      'RUNNER_UNAVAILABLE',
      'Project runner is unavailable',
    );
    const taskId = id('inf'),
      expires = this.clock() + 240000;
    this.db.run(
      'INSERT INTO inference_tasks(tenant_id,project_id,id,runner_id,provider,job_id,request_json,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      s.tenantId,
      s.projectId,
      taskId,
      runnerId,
      kind,
      this.job.id,
      JSON.stringify({ model, effort, system, input, schema, maxOutputTokens, images }),
      'queued',
      this.clock(),
      expires,
    );
    try {
      while (this.clock() < expires) {
        if (signal?.aborted) throw new ProviderError('ABORTED', 'Build cancelled', { sent: true });
        const r = this.db.get(
          'SELECT * FROM inference_tasks WHERE tenant_id=? AND project_id=? AND id=?',
          s.tenantId,
          s.projectId,
          taskId,
        );
        if (r.status === 'succeeded') return parseJson(r.result_json);
        if (r.status === 'failed')
          throw new ProviderError(
            parseJson(r.error_json)?.code ?? 'RUNNER_ERROR',
            'The project runner failed to produce the artifact',
            { sent: true },
          );
        if (r.status === 'cancelled')
          throw new ProviderError('ABORTED', 'Runner task cancelled', { sent: true });
        await sleep(250, signal);
      }
      throw new ProviderError(
        'RUNNER_TIMEOUT',
        'No runner result before the four-minute deadline',
        { sent: true },
      );
    } finally {
      this.db.run(
        "UPDATE inference_tasks SET status='cancelled' WHERE tenant_id=? AND project_id=? AND id=? AND status IN ('queued','running')",
        s.tenantId,
        s.projectId,
        taskId,
      );
    }
  }
  async completeJson(request) {
    return (await this.generate(request)).value;
  }
}
