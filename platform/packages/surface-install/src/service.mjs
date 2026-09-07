// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { projectAccess } from '../../control-plane/src/access.mjs';
import { assert, hash, id, parseJson, token } from '../../control-plane/src/util.mjs';
import { normalizeInstallReceipt, normalizeSurfaceInstall } from './contracts.mjs';
import { generateSurfaceInstall } from './templates.mjs';
import { surfaceTargetProfile } from './target-profiles.mjs';

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
