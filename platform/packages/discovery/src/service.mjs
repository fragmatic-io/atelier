// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parseOpenApi } from '../../scanner/src/index.mjs';
import {
  buildCapabilityGraph,
  buildProjectModel,
  buildSearchIndex,
} from '../../project-model/src/index.mjs';
import { projectAccess, observerScope } from '../../control-plane/src/access.mjs';
import {
  assert,
  bool,
  canonical,
  choice,
  hash,
  id,
  noPrototypeKeys,
  object,
  parseJson,
  text,
  token,
} from '../../control-plane/src/util.mjs';
import { capabilityFingerprint, stableModelVersion } from '../../control-plane/src/services.mjs';
import {
  assertPublicDocumentUrl,
  capabilityFromObservation,
  normalizeAllowedOrigin,
  normalizeDiscoveryEvent,
  operationIdentity,
  recommendCapability,
} from './contracts.mjs';
import {
  designFingerprint,
  mergeDesignContract,
  normalizeDesignContract,
} from './design-contract.mjs';

const PRIVATE_V4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const PRIVATE_V6 = /^(?:::1$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i;
const sourceView = (row) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  allowedOrigins: parseJson(row.allowed_origins_json, []),
  safeSampleFields: parseJson(row.config_json, {}).safeSampleFields ?? [],
  semanticSamples: parseJson(row.config_json, {}).semanticSamples === true,
  designCapture: parseJson(row.config_json, {}).designCapture === true,
  status: row.status,
  lastSeenAt: row.last_seen_at,
  lastError: row.last_error,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
});

function privateAddress(address) {
  return (
    (isIP(address) === 4 && PRIVATE_V4.test(address)) ||
    (isIP(address) === 6 && PRIVATE_V6.test(address))
  );
}

async function readLimited(response, max = 2 * 1024 * 1024) {
  assert(response.ok, 400, 'SPEC_FETCH_FAILED', `Specification server returned ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  assert(!declared || declared <= max, 413, 'SPEC_TOO_LARGE', 'Specification exceeds 2 MB');
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    assert(size <= max, 413, 'SPEC_TOO_LARGE', 'Specification exceeds 2 MB');
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export class DiscoveryService {
  constructor(service, { fetcher = globalThis.fetch, dnsLookup = lookup } = {}) {
    this.service = service;
    this.db = service.db;
    this.store = service.store;
    this.clock = service.clock;
    this.fetcher = fetcher;
    this.dnsLookup = dnsLookup;
  }

  list(identity, t, p) {
    projectAccess(this.db, identity, t, p);
    return this.db
      .all(
        'SELECT * FROM discovery_sources WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC,id',
        t,
        p,
      )
      .map(sourceView);
  }

  create(identity, t, p, input) {
    const s = projectAccess(this.db, identity, t, p, 'edit');
    const kind = choice(input.kind ?? 'browser', ['browser', 'server'], 'Discovery source kind');
    const origins = [...new Set((input.allowedOrigins ?? []).map(normalizeAllowedOrigin))];
    const safeSampleFields = [
      ...new Set(
        (input.safeSampleFields ?? []).map((field) =>
          text(field, 'Safe sample field', { max: 80 }).toLowerCase(),
        ),
      ),
    ];
    const semanticSamples = bool(input.semanticSamples ?? false);
    const designCapture = bool(input.designCapture ?? false);
    assert(
      safeSampleFields.length <= 20,
      400,
      'SAMPLE_FIELD_LIMIT',
      'At most 20 safe sample fields are allowed',
    );
    assert(
      safeSampleFields.every(
        (field) =>
          /^[a-z][a-z0-9_.-]*$/.test(field) &&
          !/password|secret|token|cookie|authorization|email|phone|address|name/.test(field),
      ),
      400,
      'UNSAFE_SAMPLE_FIELD',
      'Safe sample fields cannot be credential or PII-shaped',
    );
    assert(
      kind !== 'browser' || origins.length > 0,
      400,
      'ORIGIN_REQUIRED',
      'Browser observation needs an allowed origin',
    );
    assert(origins.length <= 20, 400, 'ORIGIN_LIMIT', 'At most 20 origins are allowed');
    const projectKey = `atl_obs_${token()}`;
    const row = {
      id: id('src'),
      kind,
      name: text(
        input.name ?? (kind === 'browser' ? 'Browser snippet' : 'Server SDK'),
        'Source name',
        { max: 100 },
      ),
      origins,
      createdAt: this.clock(),
    };
    this.db.run(
      'INSERT INTO discovery_sources(tenant_id,project_id,id,kind,name,credential_hash,allowed_origins_json,config_json,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      t,
      p,
      row.id,
      row.kind,
      row.name,
      hash(projectKey),
      JSON.stringify(origins),
      canonical({ safeSampleFields, semanticSamples, designCapture }),
      'active',
      identity.userId,
      row.createdAt,
    );
    this.store.audit(s, 'discovery.source.created', row.id, { kind, origins });
    return {
      ...sourceView(
        this.db.get(
          'SELECT * FROM discovery_sources WHERE tenant_id=? AND project_id=? AND id=?',
          t,
          p,
          row.id,
        ),
      ),
      projectKey,
    };
  }

  revoke(identity, t, p, sourceId) {
    const s = projectAccess(this.db, identity, t, p, 'edit');
    const changed = this.db.run(
      "UPDATE discovery_sources SET status='revoked',revoked_at=? WHERE tenant_id=? AND project_id=? AND id=? AND revoked_at IS NULL",
      this.clock(),
      t,
      p,
      sourceId,
    );
    assert(changed.changes === 1, 404, 'NOT_FOUND', 'Discovery source not found');
    this.store.audit(s, 'discovery.source.revoked', sourceId, {});
    return { revoked: true };
  }

  design(identity, t, p) {
    const scope = projectAccess(this.db, identity, t, p);
    const rows = this.db.all(
      `SELECT d.*,s.name source_name FROM design_observations d
       JOIN discovery_sources s ON s.tenant_id=d.tenant_id AND s.project_id=d.project_id AND s.id=d.source_id
       WHERE d.tenant_id=? AND d.project_id=? ORDER BY d.last_seen_at DESC,d.fingerprint LIMIT 20`,
      t,
      p,
    );
    const observations = rows.map((row) => ({
      sourceId: row.source_id,
      sourceName: row.source_name,
      fingerprint: row.fingerprint,
      contract: parseJson(row.contract_json),
      approved: !!row.approved_at,
      lastSeenAt: row.last_seen_at,
    }));
    const approved = rows.find((row) => row.approved_at)
      ? (() => {
          const row = rows.find((candidate) => candidate.approved_at);
          return {
            sourceId: row.source_id,
            sourceName: row.source_name,
            fingerprint: designFingerprint(parseJson(row.approved_contract_json)),
            observedFingerprint: row.fingerprint,
            contract: parseJson(row.approved_contract_json),
            approvedAt: row.approved_at,
          };
        })()
      : null;
    const syntheses = this.db
      .all(
        'SELECT * FROM design_syntheses WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC,id LIMIT 20',
        t,
        p,
      )
      .map((row) => ({
        id: row.id,
        status: row.status,
        contractFingerprint: row.contract_fingerprint,
        synthesis: this.store.getArtifact(scope, row.artifact_id, 'design-synthesis').content,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
      }));
    return { observations, approved, syntheses };
  }

  approveDesign(identity, t, p, input) {
    const scope = projectAccess(this.db, identity, t, p, 'review');
    assert(!identity.token, 403, 'HUMAN_REVIEW_REQUIRED', 'Design contracts require human review');
    const observedFingerprint = text(input.fingerprint, 'Design fingerprint', { max: 80 });
    const row = this.db.get(
      'SELECT * FROM design_observations WHERE tenant_id=? AND project_id=? AND fingerprint=?',
      t,
      p,
      observedFingerprint,
    );
    assert(row, 404, 'DESIGN_NOT_FOUND', 'Observed design contract not found');
    const approved = mergeDesignContract(parseJson(row.contract_json), input.overrides ?? {}),
      approvedFingerprint = designFingerprint(approved),
      now = this.clock();
    this.db.transaction(() => {
      this.db.run(
        'UPDATE design_observations SET approved_contract_json=NULL,approved_by=NULL,approved_at=NULL WHERE tenant_id=? AND project_id=?',
        t,
        p,
      );
      this.db.run(
        'UPDATE design_observations SET approved_contract_json=?,approved_by=?,approved_at=? WHERE tenant_id=? AND project_id=? AND source_id=? AND fingerprint=?',
        canonical(approved),
        identity.userId,
        now,
        t,
        p,
        row.source_id,
        row.fingerprint,
      );
      this.store.audit(scope, 'design.contract.approved', approvedFingerprint, {
        observedFingerprint,
        sourceId: row.source_id,
      });
    });
    return {
      observedFingerprint,
      fingerprint: approvedFingerprint,
      contract: approved,
      approvedAt: now,
    };
  }

  synthesizeDesign(identity, t, p) {
    const scope = projectAccess(this.db, identity, t, p, 'run');
    assert(
      scope.project.provider_id,
      409,
      'PROVIDER_REQUIRED',
      'Configure this project model connection before design synthesis',
    );
    const row = this.db.get(
      'SELECT approved_contract_json FROM design_observations WHERE tenant_id=? AND project_id=? AND approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 1',
      t,
      p,
    );
    const contract = parseJson(row?.approved_contract_json);
    assert(contract, 409, 'DESIGN_REVIEW_REQUIRED', 'Approve a design contract first');
    const contractFingerprint = designFingerprint(contract);
    return this.store.enqueue(
      scope,
      'design-synthesis',
      { contractFingerprint },
      { dedupeKey: `design-synthesis:${contractFingerprint}`, retryTerminal: true },
    );
  }

  reviewDesignSynthesis(identity, t, p, synthesisId, input) {
    const scope = projectAccess(this.db, identity, t, p, 'review');
    assert(!identity.token, 403, 'HUMAN_REVIEW_REQUIRED', 'Design synthesis requires human review');
    const row = this.db.get(
      'SELECT * FROM design_syntheses WHERE tenant_id=? AND project_id=? AND id=?',
      t,
      p,
      synthesisId,
    );
    assert(row, 404, 'NOT_FOUND', 'Design synthesis not found');
    assert(row.status === 'draft', 409, 'DESIGN_SYNTHESIS_REVIEWED', 'Synthesis is already reviewed');
    const approvedContract = this.db.get(
      'SELECT approved_contract_json FROM design_observations WHERE tenant_id=? AND project_id=? AND approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 1',
      t,
      p,
    );
    assert(
      designFingerprint(parseJson(approvedContract?.approved_contract_json)) ===
        row.contract_fingerprint,
      409,
      'DESIGN_CONTRACT_CHANGED',
      'Synthesize again against the current approved contract',
    );
    const decision = input.approved === true ? 'approved' : 'rejected';
    const now = this.clock();
    this.db.transaction(() => {
      if (decision === 'approved')
        this.db.run(
          "UPDATE design_syntheses SET status='rejected',reviewed_by=?,reviewed_at=? WHERE tenant_id=? AND project_id=? AND status='approved'",
          identity.userId,
          now,
          t,
          p,
        );
      this.db.run(
        'UPDATE design_syntheses SET status=?,reviewed_by=?,reviewed_at=? WHERE tenant_id=? AND project_id=? AND id=?',
        decision,
        identity.userId,
        now,
        t,
        p,
        synthesisId,
      );
      this.store.audit(scope, 'design.synthesis.reviewed', synthesisId, {
        decision,
        contractFingerprint: row.contract_fingerprint,
      });
    });
    return { id: synthesisId, status: decision, reviewedAt: now };
  }

  ingest(projectKey, origin, input) {
    assert(
      typeof projectKey === 'string' && projectKey.startsWith('atl_obs_'),
      401,
      'OBSERVER_KEY',
      'Observation key is invalid',
    );
    const source = this.db.get(
      "SELECT * FROM discovery_sources WHERE credential_hash=? AND status='active' AND revoked_at IS NULL",
      hash(projectKey),
    );
    assert(source, 401, 'OBSERVER_KEY', 'Observation key is invalid or revoked');
    const allowed = parseJson(source.allowed_origins_json, []);
    assert(
      source.kind !== 'browser' || allowed.includes(origin),
      403,
      'OBSERVER_ORIGIN',
      'This web origin is not allowed',
    );
    this.service.auth.rate(`observe:${source.id}`, { limit: 120, windowMs: 60000 });
    const now = this.clock();
    let designRevision = null;
    if (input.design !== undefined) {
      const sourceConfig = parseJson(source.config_json, {});
      assert(
        sourceConfig.designCapture === true,
        400,
        'DESIGN_CAPTURE_DISABLED',
        'Design capture is not enabled for this source',
      );
      const contract = normalizeDesignContract(input.design),
        fingerprint = designFingerprint(contract);
      this.db.run(
        'INSERT INTO design_observations(tenant_id,project_id,source_id,fingerprint,contract_json,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant_id,project_id,source_id,fingerprint) DO UPDATE SET last_seen_at=excluded.last_seen_at',
        source.tenant_id,
        source.project_id,
        source.id,
        fingerprint,
        canonical(contract),
        now,
        now,
      );
      designRevision = fingerprint;
    }
    if (input.heartbeat === true) {
      this.db.run(
        'UPDATE discovery_sources SET last_seen_at=?,last_error=NULL WHERE tenant_id=? AND project_id=? AND id=?',
        now,
        source.tenant_id,
        source.project_id,
        source.id,
      );
      return { accepted: true, heartbeat: true, newRevisions: 0, designRevision };
    }
    assert(
      Array.isArray(input.events) && input.events.length > 0 && input.events.length <= 20,
      400,
      'OBSERVATION_BATCH',
      'Send 1 to 20 observations',
    );
    const sourceConfig = parseJson(source.config_json, {});
    const events = input.events.map((event) =>
      normalizeDiscoveryEvent(event, {
        safeValueFields: sourceConfig.semanticSamples ? (sourceConfig.safeSampleFields ?? []) : [],
      }),
    );
    assert(
      sourceConfig.semanticSamples || events.every((event) => event.sample === undefined),
      400,
      'SAMPLES_DISABLED',
      'Semantic samples are not enabled for this source',
    );
    let inserted = 0,
      insertedContexts = 0;
    this.db.transaction(() => {
      for (const event of events) {
        const old = this.db.get(
          'SELECT fingerprint FROM capability_observations WHERE tenant_id=? AND project_id=? AND source_id=? AND fingerprint=?',
          source.tenant_id,
          source.project_id,
          source.id,
          event.fingerprint,
        );
        if (!old) inserted += 1;
        this.db.run(
          'INSERT INTO capability_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,project_id,source_id,fingerprint) DO UPDATE SET last_seen_at=excluded.last_seen_at,metadata_json=excluded.metadata_json,sample_json=excluded.sample_json',
          source.tenant_id,
          source.project_id,
          source.id,
          event.fingerprint,
          event.capabilityKey,
          event.method,
          event.path,
          canonical(event.inputSchema),
          canonical(event.outputSchema),
          event.sample ? canonical(event.sample) : null,
          canonical(event.metadata),
          now,
          now,
        );
        const contextHash = hash(event.metadata);
        const oldContext = this.db.get(
          'SELECT context_hash FROM capability_observation_contexts WHERE tenant_id=? AND project_id=? AND source_id=? AND fingerprint=? AND context_hash=?',
          source.tenant_id,
          source.project_id,
          source.id,
          event.fingerprint,
          contextHash,
        );
        if (!oldContext) insertedContexts += 1;
        this.db.run(
          'INSERT INTO capability_observation_contexts VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,project_id,source_id,fingerprint,context_hash) DO UPDATE SET last_seen_at=excluded.last_seen_at',
          source.tenant_id,
          source.project_id,
          source.id,
          event.fingerprint,
          contextHash,
          canonical(event.metadata),
          now,
          now,
        );
      }
      this.db.run(
        'UPDATE discovery_sources SET last_seen_at=?,last_error=NULL WHERE tenant_id=? AND project_id=? AND id=?',
        now,
        source.tenant_id,
        source.project_id,
        source.id,
      );
    });
    const currentProject = this.db.get(
      'SELECT model_id FROM projects WHERE tenant_id=? AND id=?',
      source.tenant_id,
      source.project_id,
    );
    const currentModel = currentProject?.model_id
      ? this.db.get(
          "SELECT content_json FROM artifacts WHERE tenant_id=? AND project_id=? AND id=? AND kind='model'",
          source.tenant_id,
          source.project_id,
          currentProject.model_id,
        )
      : null;
    const knownEvidence = new Set(
      (currentModel ? (parseJson(currentModel.content_json, {}).capabilities ?? []) : []).flatMap(
        (capability) => (capability.evidence ?? []).map((item) => item.sourceHash),
      ),
    );
    if (
      inserted ||
      insertedContexts ||
      events.some((event) => !knownEvidence.has(event.fingerprint))
    )
      this.rebuildFromObservations(source);
    return {
      accepted: true,
      received: events.length,
      newRevisions: inserted,
      newContexts: insertedContexts,
    };
  }

  observationCapabilities(source) {
    const latest = new Map();
    for (const row of this.db.all(
      'SELECT * FROM capability_observations WHERE tenant_id=? AND project_id=? ORDER BY last_seen_at DESC,fingerprint',
      source.tenant_id,
      source.project_id,
    )) {
      if (latest.has(row.capability_key)) continue;
      const contexts = this.db
        .all(
          'SELECT metadata_json FROM capability_observation_contexts WHERE tenant_id=? AND project_id=? AND source_id=? AND fingerprint=? ORDER BY last_seen_at DESC LIMIT 100',
          row.tenant_id,
          row.project_id,
          row.source_id,
          row.fingerprint,
        )
        .map((context) => parseJson(context.metadata_json, {}));
      latest.set(
        row.capability_key,
        capabilityFromObservation(
          {
            method: row.method,
            path: row.path,
            inputSchema: parseJson(row.input_schema_json, {}),
            outputSchema: parseJson(row.output_schema_json, {}),
            sample: parseJson(row.sample_json),
            fingerprint: row.fingerprint,
            metadata: parseJson(row.metadata_json, {}),
            observedAt: row.last_seen_at,
            observedContexts: contexts,
          },
          source,
        ),
      );
    }
    return [...latest.values()];
  }

  rebuildFromObservations(source) {
    const scope = observerScope(this.db, source);
    return this.mergeModel(scope, this.observationCapabilities(source), {
      adapter: source.kind === 'browser' ? 'browser-observation-v1' : 'server-observation-v1',
    });
  }

  async importSpec(identity, t, p, input) {
    const scope = projectAccess(this.db, identity, t, p, 'edit');
    let document = input.document;
    let sourceName = text(input.sourceName ?? 'OpenAPI contract', 'Source name', { max: 120 });
    let sourceUrl = null;
    if (input.sourceUrl) {
      const url = assertPublicDocumentUrl(input.sourceUrl);
      const addresses = await this.dnsLookup(url.hostname, { all: true, verbatim: true });
      assert(
        addresses.length && addresses.every((item) => !privateAddress(item.address)),
        400,
        'SPEC_PRIVATE_ADDRESS',
        'Specification host resolves to a private address',
      );
      const response = await this.fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/json, application/yaml, text/yaml, text/plain' },
      });
      document = await readLimited(response);
      sourceUrl = url.href;
      sourceName = text(input.sourceName ?? url.hostname, 'Source name', { max: 120 });
    }
    assert(
      document !== undefined,
      400,
      'SPEC_REQUIRED',
      'Upload a specification or provide its HTTPS URL',
    );
    if (typeof document === 'string') {
      assert(
        Buffer.byteLength(document) <= 2 * 1024 * 1024,
        413,
        'SPEC_TOO_LARGE',
        'Specification exceeds 2 MB',
      );
      try {
        document = JSON.parse(document);
      } catch {
        const yaml = await import('yaml');
        document = yaml.parse(document);
      }
    }
    object(document);
    noPrototypeKeys(document);
    assert(
      Buffer.byteLength(canonical(document)) <= 2 * 1024 * 1024,
      413,
      'SPEC_TOO_LARGE',
      'Specification exceeds 2 MB',
    );
    const parsed = parseOpenApi(document, {
      sourcePath: sourceUrl ?? sourceName,
      content: canonical(document),
    });
    assert(
      parsed.capabilities.length > 0,
      400,
      'SPEC_EMPTY',
      'OpenAPI contract contains no operations',
    );
    const sourceId = id('src');
    const now = this.clock();
    this.db.run(
      'INSERT INTO discovery_sources(tenant_id,project_id,id,kind,name,allowed_origins_json,config_json,status,last_seen_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      t,
      p,
      sourceId,
      'openapi',
      sourceName,
      '[]',
      canonical({
        sourceUrl,
        documentHash: hash(document),
        operations: parsed.capabilities.length,
      }),
      'active',
      now,
      identity.userId,
      now,
    );
    const result = this.mergeModel(
      scope,
      parsed.capabilities.map((capability) => ({
        ...capability,
        securityReviewed: false,
        agentEnabled: false,
        recommendation: recommendCapability(capability),
      })),
      { adapter: 'openapi-3', entities: parsed.entities },
    );
    this.store.audit(scope, 'discovery.spec.imported', sourceId, {
      operations: parsed.capabilities.length,
      sourceUrl,
    });
    return {
      source: sourceView(
        this.db.get(
          'SELECT * FROM discovery_sources WHERE tenant_id=? AND project_id=? AND id=?',
          t,
          p,
          sourceId,
        ),
      ),
      operations: parsed.capabilities.length,
      projectVersion: result.projectVersion,
    };
  }

  mergeModel(scope, incoming, { adapter, entities = [] } = {}) {
    const project = this.db.get(
      'SELECT * FROM projects WHERE tenant_id=? AND id=? AND archived_at IS NULL',
      scope.tenantId,
      scope.projectId,
    );
    assert(project, 404, 'NOT_FOUND', 'Project not found');
    const current = project.model_id
      ? this.store.getArtifact(scope, project.model_id, 'model').content
      : buildProjectModel({
          projectId: scope.projectId,
          rootHash: hash({ project: scope.projectId, mode: 'metadata-only' }),
          capabilities: [],
          entities: [],
          routes: [],
          components: [],
          permissions: [],
          slots: [
            {
              id: 'workspace.overview',
              mode: 'route',
              allowedCapabilityGroups: ['*'],
              allowWriteActions: false,
              allowedPiiFields: [],
              maxAdaptationLevel: 2,
              fallback: 'host_ui',
              contextSchema: { type: 'object' },
            },
          ],
          adapters: [],
          sourceSummary: { mode: 'metadata-only', filesScanned: 0, sourceFiles: 0 },
        });
    const byOperation = new Map(
      current.capabilities.map((capability) => [operationIdentity(capability), capability]),
    );
    for (const candidate of incoming) {
      const key = operationIdentity(candidate);
      const old = byOperation.get(key);
      let next = candidate;
      if (old) {
        const authoritative =
          (old.evidence ?? []).some((item) => item.source === 'openapi') &&
          !(candidate.evidence ?? []).some((item) => item.source === 'openapi');
        next = authoritative
          ? { ...old, evidence: [...(old.evidence ?? []), ...(candidate.evidence ?? [])] }
          : {
              ...old,
              ...candidate,
              id: old.id,
              evidence: [...(old.evidence ?? []), ...(candidate.evidence ?? [])],
            };
      }
      const fingerprint = capabilityFingerprint(next);
      if (old?.securityReviewed && old.reviewedSchemaHash === fingerprint) {
        for (const field of [
          'securityReviewed',
          'reviewDecision',
          'agentEnabled',
          'risk',
          'confirmation',
          'requiredPermissions',
          'piiFields',
          'reversible',
          'rollbackCapabilityId',
          'reviewedSchemaHash',
          'reviewedBy',
          'reviewedAt',
        ])
          if (old[field] !== undefined) next[field] = old[field];
      } else {
        next.securityReviewed = false;
        next.reviewDecision = 'pending';
        next.agentEnabled = false;
        next.reviewedSchemaHash = fingerprint;
      }
      next.recommendation = next.recommendation ?? recommendCapability(next);
      byOperation.set(key, next);
    }
    const model = {
      ...current,
      generatedAt: new Date(this.clock()).toISOString(),
      capabilities: [...byOperation.values()].sort((a, b) => a.id.localeCompare(b.id)),
      entities: [
        ...new Map(
          [...(current.entities ?? []), ...entities].map((entity) => [entity.id, entity]),
        ).values(),
      ],
      adapters: [...new Set([...(current.adapters ?? []), adapter].filter(Boolean))],
      sourceSummary: {
        ...(current.sourceSummary ?? {}),
        mode: current.sourceSnapshotId ? 'source-and-metadata' : 'metadata-only',
      },
    };
    model.capabilityGraph = buildCapabilityGraph(model.capabilities, model.entities);
    model.searchIndex = buildSearchIndex(model);
    model.projectVersion = stableModelVersion(model);
    return this.db.transaction(() => {
      const artifact = this.store.artifact(scope, 'model', model);
      const changed = this.db.run(
        'UPDATE projects SET model_id=?,revision=revision+1 WHERE tenant_id=? AND id=? AND revision=?',
        artifact.id,
        scope.tenantId,
        scope.projectId,
        project.revision,
      );
      assert(
        changed.changes === 1,
        409,
        'REVISION_CONFLICT',
        'Project changed while applying discovery evidence',
      );
      this.store.audit(scope, 'project.discovery.updated', artifact.id, {
        adapter,
        capabilities: model.capabilities.length,
      });
      return model;
    });
  }

  status(identity, t, p) {
    const scope = projectAccess(this.db, identity, t, p);
    const model = scope.project.model_id
      ? this.store.getArtifact(scope, scope.project.model_id, 'model').content
      : null;
    const sources = this.list(identity, t, p).filter((source) => !source.revokedAt);
    const design = this.design(identity, t, p);
    const activeCollectors = sources.filter((source) =>
      ['browser', 'server'].includes(source.kind),
    );
    const observations = this.db.get(
      'SELECT count(*) n FROM capability_observations WHERE tenant_id=? AND project_id=?',
      t,
      p,
    ).n;
    const capabilities = model?.capabilities ?? [];
    const reviewed = capabilities.filter(
      (capability) => capability.securityReviewed || capability.reviewDecision === 'rejected',
    ).length;
    const agentEnabled = capabilities.filter(
      (capability) => capability.securityReviewed && capability.agentEnabled,
    ).length;
    const profileRow = this.db.get(
      'SELECT artifact_id FROM agent_profiles WHERE tenant_id=? AND project_id=?',
      t,
      p,
    );
    const profile = profileRow
      ? this.store.getArtifact(scope, profileRow.artifact_id, 'agent-profile').content
      : null;
    const profileCurrent = !!profile && profile.projectVersion === model?.projectVersion;
    const connection = scope.project.provider_id
      ? this.db.get(
          'SELECT * FROM connections WHERE tenant_id=? AND id=? AND revoked_at IS NULL AND (project_id IS NULL OR project_id=?)',
          t,
          scope.project.provider_id,
          p,
        )
      : null;
    const connectionConfig = parseJson(connection?.config_json, {});
    const provider =
      !!connection &&
      (!['codex-cli', 'claude-cli'].includes(connection.kind) ||
        !!this.db.get(
          'SELECT id FROM runners WHERE tenant_id=? AND project_id=? AND id=? AND revoked_at IS NULL AND last_seen>?',
          t,
          p,
          connectionConfig.runnerId,
          this.clock() - 60000,
        ));
    const published = (
      model
        ? this.db.all(
            "SELECT artifact_id FROM releases WHERE tenant_id=? AND project_id=? AND status='published'",
            t,
            p,
          )
        : []
    ).filter(
      (release) =>
        this.store.getArtifact(scope, release.artifact_id, 'experience').content.bundle
          ?.projectVersion === model.projectVersion,
    ).length;
    const installs = this.db
      .all(
        "SELECT * FROM surface_installs WHERE tenant_id=? AND project_id=? AND status!='revoked' AND revoked_at IS NULL ORDER BY created_at DESC,id",
        t,
        p,
      )
      .map((row) => ({
        id: row.id,
        framework: row.framework,
        mode: row.mode,
        routePath: row.route_path,
        navLabel: row.nav_label,
        slotId: row.slot_id,
        environment: row.environment,
        status: row.status,
        facts: {
          routeMounted: row.route_mounted === 1,
          bridgeReachable: row.bridge_reachable === 1,
          authorityConfigured: row.authority_configured === 1,
          designContractBound: !!row.design_fingerprint,
        },
        lastSeenAt: row.last_seen_at,
        lastError: row.last_error,
      }));
    const verifiedInstalls = installs.filter((install) => install.status === 'verified').length;
    const steps = [
      {
        id: 'connect',
        label: 'Connect discovery',
        complete:
          activeCollectors.length > 0 || sources.some((source) => source.kind === 'openapi'),
        facts: { sources: sources.length, collectors: activeCollectors.length },
      },
      {
        id: 'discover',
        label: 'Discover capabilities',
        complete: capabilities.length > 0,
        facts: { observations, capabilities: capabilities.length },
      },
      {
        id: 'review',
        label: 'Review inventory',
        complete: capabilities.length > 0 && reviewed === capabilities.length,
        facts: { reviewed, total: capabilities.length, remaining: capabilities.length - reviewed },
      },
      {
        id: 'agent',
        label: 'Configure delivery',
        complete: profileCurrent && agentEnabled > 0 && provider,
        facts: {
          profile: profileCurrent,
          agentEnabled,
          provider,
          specialists: profileCurrent ? (profile.specialists?.length ?? 0) : 0,
          designApproved: !!design.approved,
          surfaces: published,
          installs: installs.length,
          verifiedInstalls,
        },
      },
      {
        id: 'publish',
        label: 'Publish integration',
        complete: published > 0 && verifiedInstalls > 0 && !!design.approved,
        facts: { published, verifiedInstalls },
      },
    ];
    const first = steps.find((step) => !step.complete);
    return {
      state: steps.every((step) => step.complete)
        ? 'ready'
        : capabilities.length
          ? 'action_required'
          : activeCollectors.length
            ? 'listening'
            : 'not_started',
      nextStep: first?.id ?? null,
      steps,
      sources,
      design,
      installs,
      facts: {
        observations,
        capabilities: capabilities.length,
        reviewed,
        agentEnabled,
        provider,
        specialists: profileCurrent ? (profile.specialists?.length ?? 0) : 0,
        designObserved: design.observations.length,
        designApproved: !!design.approved,
        published,
        installs: installs.length,
        verifiedInstalls,
      },
      generatedAt: this.clock(),
    };
  }
}
