// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { projectAccess, surfaceInstallScope } from '../../control-plane/src/access.mjs';
import { assert, hash, id, parseJson, token } from '../../control-plane/src/util.mjs';
import { normalizeInstallReceipt, normalizeSurfaceInstall } from './contracts.mjs';
import { generateSurfaceInstall } from './templates.mjs';
import { surfaceTargetProfile } from './target-profiles.mjs';
import { verifySignedBundle } from '../../runtime/src/index.mjs';
import { designStyles } from './design-css.mjs';

const view = (row) => ({
  id: row.id,
  framework: row.framework,
  target: surfaceTargetProfile(row.framework),
  mode: row.mode,
  applicationOrigin: row.application_origin,
  routePath: row.route_path,
  navLabel: row.nav_label,
  bridgePath: row.bridge_path,
  slotId: row.slot_id,
  environment: row.environment,
  designFingerprint: row.design_fingerprint,
  bundleHash: row.bundle_hash,
  status: row.status,
  facts: {
    routeMounted: row.route_mounted === 1,
    bridgeReachable: row.bridge_reachable === 1,
    authorityConfigured: row.authority_configured === 1,
    designContractBound: !!row.design_fingerprint,
  },
  lastSeenAt: row.last_seen_at,
  verifiedAt: row.verified_at,
  lastError: row.last_error,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
});

export class SurfaceInstallService {
  constructor(service, { controlOrigin }) {
    this.service = service;
    this.db = service.db;
    this.store = service.store;
    this.clock = service.clock;
    this.controlOrigin = controlOrigin;
  }

  list(identity, tenantId, projectId) {
    projectAccess(this.db, identity, tenantId, projectId);
    return this.db
      .all(
        'SELECT * FROM surface_installs WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC,id',
        tenantId,
        projectId,
      )
      .map(view);
  }

  create(identity, tenantId, projectId, input) {
    const scope = projectAccess(this.db, identity, tenantId, projectId, 'edit');
    const model = this.service.model(identity, tenantId, projectId);
    const normalized = normalizeSurfaceInstall(input, model);
    const design = this.db.get(
      'SELECT approved_contract_json FROM design_observations WHERE tenant_id=? AND project_id=? AND approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 1',
      tenantId,
      projectId,
    );
    assert(
      design?.approved_contract_json,
      409,
      'DESIGN_REVIEW_REQUIRED',
      'Review a host design contract before generating a surface installer',
    );
    const designContract = parseJson(design.approved_contract_json),
      designFingerprint = hash(designContract);
    const installId = id('ins');
    const verificationKey = `atl_ins_${token()}`;
    const createdAt = this.clock();
    const seed = {
      ...normalized,
      id: installId,
      tenantId,
      projectId,
      controlOrigin: this.controlOrigin,
      designContract,
      designFingerprint,
      createdAt,
    };
    const generated = generateSurfaceInstall({ ...seed, verificationKey });
    this.db.run(
      'INSERT INTO surface_installs(tenant_id,project_id,id,framework,mode,application_origin,route_path,nav_label,bridge_path,slot_id,environment,credential_hash,bundle_hash,status,created_by,created_at,design_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      tenantId,
      projectId,
      installId,
      normalized.framework,
      normalized.mode,
      normalized.applicationOrigin,
      normalized.routePath,
      normalized.navLabel,
      normalized.bridgePath,
      normalized.slotId,
      normalized.environment,
      hash(verificationKey),
      generated.install.bundleHash,
      'waiting',
      identity.userId,
      createdAt,
      designFingerprint,
    );
    this.store.audit(scope, 'surface.install.created', installId, {
      framework: normalized.framework,
      mode: normalized.mode,
      slotId: normalized.slotId,
      routePath: normalized.routePath,
      applicationOrigin: normalized.applicationOrigin,
      bundleHash: generated.install.bundleHash,
      designFingerprint,
    });
    return { install: view(this.row(tenantId, projectId, installId)), bundle: generated };
  }

  row(tenantId, projectId, installId) {
    return this.db.get(
      'SELECT * FROM surface_installs WHERE tenant_id=? AND project_id=? AND id=?',
      tenantId,
      projectId,
      installId,
    );
  }

  authorize(verificationKey, origin, bucket = 'embed') {
    assert(
      typeof verificationKey === 'string' && verificationKey.startsWith('atl_ins_'),
      401,
      'INSTALL_KEY',
      'Install key is invalid',
    );
    const install = this.db.get(
      "SELECT * FROM surface_installs WHERE credential_hash=? AND framework='hosted-script' AND status!='revoked' AND revoked_at IS NULL",
      hash(verificationKey),
    );
    assert(install, 401, 'INSTALL_KEY', 'Hosted install key is invalid or revoked');
    assert(
      origin === install.application_origin,
      403,
      'INSTALL_ORIGIN',
      'Install origin is not allowed',
    );
    this.service.auth.rate(`${bucket}:${install.id}`, { limit: 120, windowMs: 60000 });
    return install;
  }

  designContract(install) {
    const match = this.db
      .all(
        'SELECT approved_contract_json FROM design_observations WHERE tenant_id=? AND project_id=? AND approved_at IS NOT NULL ORDER BY approved_at DESC',
        install.tenant_id,
        install.project_id,
      )
      .map((row) => parseJson(row.approved_contract_json))
      .find((contract) => hash(contract) === install.design_fingerprint);
    assert(
      match,
      409,
      'INSTALL_DESIGN_CHANGED',
      'The approved design contract for this install is unavailable; create a new install',
    );
    return match;
  }

  publicStyles(verificationKey, origin) {
    const install = this.authorize(verificationKey, origin, 'embed-style');
    return designStyles(install.id, this.designContract(install));
  }

  publicManifest(verificationKey, origin) {
    const install = this.authorize(verificationKey, origin, 'embed-manifest');
    const deployment = this.db.get(
      'SELECT * FROM deployments WHERE tenant_id=? AND project_id=? AND slot_id=? AND environment=?',
      install.tenant_id,
      install.project_id,
      install.slot_id,
      install.environment,
    );
    assert(
      deployment?.release_id,
      409,
      'SURFACE_NOT_PUBLISHED',
      `Publish ${install.slot_id} to ${install.environment} before loading the hosted script`,
    );
    const release = this.db.get(
      'SELECT signature_json FROM releases WHERE tenant_id=? AND project_id=? AND id=?',
      install.tenant_id,
      install.project_id,
      deployment.release_id,
    );
    const bundle = parseJson(release?.signature_json);
    assert(bundle, 409, 'INVALID_RELEASE', 'Published surface bundle is missing');
    try {
      verifySignedBundle(bundle, this.service.publicKeys(surfaceInstallScope(this.db, install)));
    } catch {
      assert(false, 410, 'RELEASE_REVOKED', 'Published surface signature is invalid or revoked');
    }
    assert(
      bundle.tenantId === install.tenant_id &&
        bundle.projectId === install.project_id &&
        bundle.slotId === install.slot_id &&
        bundle.environment === install.environment,
      409,
      'BUNDLE_SCOPE',
      'Published surface scope does not match this install',
    );
    const scope = surfaceInstallScope(this.db, install);
    const project = scope.project;
    assert(project.model_id, 409, 'MODEL_REQUIRED', 'A current capability model is required');
    const model = this.store.getArtifact(
      scope,
      project.model_id,
      'model',
    ).content;
    assert(
      bundle.projectVersion === model.projectVersion,
      409,
      'PROJECT_VERSION_CHANGED',
      'The published surface must be regenerated against the current capability model',
    );
    const ids = [
      ...new Set(
        [...bundle.experiencePlan.queryPlan, ...bundle.experiencePlan.actionPlan].map(
          (entry) => entry.capabilityId,
        ),
      ),
    ];
    const capabilities = ids.map((capabilityId) => {
      const capability = model.capabilities.find((candidate) => candidate.id === capabilityId);
      assert(
        capability?.securityReviewed &&
          capability.operation?.protocol === 'http' &&
          /^[A-Z]+$/.test(capability.operation.method) &&
          capability.operation.path.startsWith('/') &&
          !capability.operation.path.startsWith('//') &&
          !capability.operation.path.includes('..'),
        409,
        'CLIENT_CAPABILITY_DENIED',
        `Hosted client capability is not an approved same-origin HTTP operation: ${capabilityId}`,
      );
      return {
        id: capability.id,
        kind: capability.kind,
        operation: capability.operation,
        inputSchema: capability.inputSchema,
        outputSchema: capability.outputSchema,
        risk: capability.risk,
        confirmation: capability.confirmation,
      };
    });
    const designContract = this.designContract(install);
    let agent = { available: false };
    const agentRow = this.db.get(
      'SELECT artifact_id FROM agent_profiles WHERE tenant_id=? AND project_id=?',
      install.tenant_id,
      install.project_id,
    );
    if (agentRow && project.provider_id) {
      const profile = this.store.getArtifact(scope, agentRow.artifact_id, 'agent-profile').content;
      const clientOnly =
        profile.projectVersion === model.projectVersion &&
        profile.voice?.status === 'reviewed' &&
        profile.tools.length > 0 &&
        profile.tools.every((tool) => tool.execution === 'client');
      if (clientOnly)
        agent = {
          available: true,
          name: profile.name,
          subtitle: profile.voice.tone,
          clientTools: profile.tools.map((tool) => {
            const capability = model.capabilities.find((candidate) => candidate.id === tool.id);
            assert(
              capability?.securityReviewed &&
                capability.operation?.protocol === 'http' &&
                capability.operation.path.startsWith('/') &&
                !capability.operation.path.startsWith('//') &&
                !capability.operation.path.includes('..'),
              409,
              'HOSTED_AGENT_TOOL_DENIED',
              `Hosted chatbot tool is not an approved same-origin HTTP operation: ${tool.id}`,
            );
            return {
              id: tool.id,
              operation: capability.operation,
              inputSchema: tool.inputSchema,
              outputSchema: tool.outputSchema,
            };
          }),
        };
    }
    return {
      schemaVersion: 1,
      install: {
        id: install.id,
        bundleHash: install.bundle_hash,
        mode: install.mode,
        slotId: install.slot_id,
        environment: install.environment,
        designFingerprint: install.design_fingerprint,
      },
      bundle,
      capabilities,
      agent,
      designStylesheet: `${this.controlOrigin}/api/embed/v1/design.css?key=${encodeURIComponent(verificationKey)}`,
    };
  }

  revoke(identity, tenantId, projectId, installId) {
    const scope = projectAccess(this.db, identity, tenantId, projectId, 'edit');
    const changed = this.db.run(
      "UPDATE surface_installs SET status='revoked',revoked_at=? WHERE tenant_id=? AND project_id=? AND id=? AND revoked_at IS NULL",
      this.clock(),
      tenantId,
      projectId,
      installId,
    );
    assert(changed.changes === 1, 404, 'NOT_FOUND', 'Surface install not found');
    this.store.audit(scope, 'surface.install.revoked', installId, {});
    return { revoked: true };
  }

  ingest(verificationKey, origin, input) {
    assert(
      typeof verificationKey === 'string' && verificationKey.startsWith('atl_ins_'),
      401,
      'INSTALL_KEY',
      'Install verification key is invalid',
    );
    const row = this.db.get(
      "SELECT * FROM surface_installs WHERE credential_hash=? AND status!='revoked' AND revoked_at IS NULL",
      hash(verificationKey),
    );
    assert(row, 401, 'INSTALL_KEY', 'Install verification key is invalid or revoked');
    assert(
      origin === row.application_origin,
      403,
      'INSTALL_ORIGIN',
      'Install origin is not allowed',
    );
    this.service.auth.rate(`install:${row.id}`, { limit: 30, windowMs: 60000 });
    const receipt = normalizeInstallReceipt(input);
    assert(receipt.installId === row.id, 400, 'INSTALL_ID', 'Install receipt does not match');
    assert(
      receipt.bundleHash === row.bundle_hash,
      409,
      'INSTALL_BUNDLE_CHANGED',
      'Install bundle changed; generate and apply a current bundle',
    );
    const verified =
      receipt.routeMounted &&
      receipt.bridgeReachable &&
      receipt.authorityConfigured &&
      !!row.design_fingerprint;
    const now = this.clock();
    this.db.run(
      'UPDATE surface_installs SET status=?,route_mounted=?,bridge_reachable=?,authority_configured=?,last_seen_at=?,verified_at=?,last_error=? WHERE tenant_id=? AND project_id=? AND id=?',
      verified
        ? 'verified'
        : receipt.routeMounted || receipt.bridgeReachable || receipt.authorityConfigured
          ? 'partial'
          : 'waiting',
      receipt.routeMounted ? 1 : 0,
      receipt.bridgeReachable ? 1 : 0,
      receipt.authorityConfigured ? 1 : 0,
      now,
      verified ? now : null,
      receipt.error,
      row.tenant_id,
      row.project_id,
      row.id,
    );
    return {
      accepted: true,
      verified,
      facts: view(this.row(row.tenant_id, row.project_id, row.id)).facts,
    };
  }
}
