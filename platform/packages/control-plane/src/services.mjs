// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, readdir, lstat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import {
  generateSigningKeyPair,
  signBundle,
  verifySignedBundle,
} from '../../runtime/src/index.mjs';
import {
  buildProjectModel,
  buildCapabilityGraph,
  buildSearchIndex,
  searchProjectModel,
} from '../../project-model/src/index.mjs';
import { evaluateBundle } from '../../evaluator/src/index.mjs';
import { Store } from './store.mjs';
import { tenantAccess, projectAccess, listProjects, requireScope } from './access.mjs';
import {
  assert,
  AppError,
  bool,
  canonical,
  choice,
  email,
  hash,
  id,
  integer,
  noPrototypeKeys,
  object,
  parseJson,
  safePath,
  strings,
  text,
  token,
} from './util.mjs';
import { newApiToken, passwordMatches } from './crypto.mjs';
import { validateOutput } from '../../providers/src/schema.mjs';
import { DEFAULT_HOSTS, API_KINDS } from '../../providers/src/api.mjs';
import { createOpenApiDocument } from '../../api-docs/src/openapi.mjs';
export const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.graphql',
  '.gql',
  '.prisma',
  '.md',
  '.mdx',
  '.yaml',
  '.yml',
]);
export function validateSnapshot(value) {
  object(value);
  noPrototypeKeys(value);
  assert(
    Array.isArray(value.files) && value.files.length > 0 && value.files.length <= 1200,
    400,
    'INVALID_SNAPSHOT',
    'A snapshot needs 1–1,200 files',
  );
  const seen = new Set();
  let bytes = 0;
  const files = value.files.map((f) => {
    object(f);
    const path = safePath(f.path);
    const parts = path.split('/');
    assert(
      !parts.some(
        (p) =>
          ['.git', 'node_modules', '.next', 'dist', '.atelier', 'data', 'coverage'].includes(p) ||
          p.startsWith('.env'),
      ) && !/\.(pem|p12|key|db|sqlite|sql|log)$/i.test(path),
      400,
      'SOURCE_DENIED',
      `Sensitive or generated path is not accepted: ${path}`,
    );
    assert(
      SOURCE_EXTENSIONS.has(extname(path).toLowerCase()),
      400,
      'SOURCE_TYPE',
      'Unsupported source file type',
    );
    assert(
      typeof f.content === 'string' && Buffer.byteLength(f.content) <= 512 * 1024,
      413,
      'SOURCE_TOO_LARGE',
      'Individual source files are limited to 512 KB',
    );
    assert(
      !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk-(?:proj-|ant-)?)[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16}/.test(
        f.content,
      ),
      400,
      'SECRET_DETECTED',
      `Potential credential material in ${path}; remove it before upload`,
    );
    assert(!seen.has(path), 400, 'DUPLICATE_PATH', 'Duplicate source path');
    seen.add(path);
    bytes += Buffer.byteLength(f.content);
    return { path, content: f.content };
  });
  assert(
    bytes <= 8 * 1024 * 1024,
    413,
    'SNAPSHOT_TOO_LARGE',
    'Snapshots are limited to 8 MB of text',
  );
  return { version: 1, files: files.sort((a, b) => a.path.localeCompare(b.path)), bytes };
}
export function safeProject(p) {
  return {
    id: p.id,
    tenantId: p.tenant_id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    modelId: p.model_id,
    providerId: p.provider_id,
    model: p.model_name,
    settings: parseJson(p.settings_json, {}),
    revision: p.revision,
    createdAt: p.created_at,
  };
}
export function safeConnection(c) {
  return {
    id: c.id,
    tenantId: c.tenant_id,
    projectId: c.project_id,
    name: c.name,
    kind: c.kind,
    config: parseJson(c.config_json, {}),
    hasSecret: !!c.secret_cipher,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    revoked: !!c.revoked_at,
  };
}
export function safeJob(j) {
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    stage: j.stage,
    attempts: j.attempts,
    createdBy: j.created_by,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
    startedAt: j.started_at,
    completedAt: j.completed_at,
    result: parseJson(j.result_json),
    error: parseJson(j.error_json),
    trace: parseJson(j.trace_json, []),
    cancelRequested: !!j.cancel_requested,
  };
}
export function capabilityFingerprint(c) {
  return hash({
    input: c.inputSchema,
    output: c.outputSchema,
    operation: c.operation ?? null,
    kind: c.kind,
  });
}
export function stableModelVersion(model) {
  const volatile = new Set([
    'generatedAt',
    'observedAt',
    'evaluatedAt',
    'projectVersion',
    'searchIndex',
    'projectRoot',
    'observedContexts',
  ]);
  function stable(v) {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => !volatile.has(k))
          .map(([k, x]) => [k, stable(x)]),
      );
    return v;
  }
  return hash(stable(model)).slice(0, 32);
}
export class ControlService {
  constructor(
    db,
    box,
    auth,
    {
      clock = () => Date.now(),
      allowedProviderHosts = DEFAULT_HOSTS,
      allowTenantCreation = true,
    } = {},
  ) {
    this.db = db;
    this.box = box;
    this.auth = auth;
    this.clock = clock;
    this.store = new Store(db, { clock });
    this.allowedProviderHosts = allowedProviderHosts;
    this.allowTenantCreation = allowTenantCreation;
  }
  createTenant(identity, input) {
    assert(
      identity?.userId && !identity.token,
      403,
      'SESSION_REQUIRED',
      'A signed-in user is required',
    );
    assert(
      this.allowTenantCreation,
      403,
      'TENANT_CREATION_DISABLED',
      'Workspace creation is disabled by this deployment',
    );
    const name = text(input.name, 'Workspace name', { max: 80 });
    const slug = text(
      input.slug ??
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
      'Slug',
      { max: 60 },
    );
    assert(
      /^[a-z0-9][a-z0-9-]*$/.test(slug),
      400,
      'INVALID_SLUG',
      'Use lowercase letters, numbers and hyphens',
    );
    return this.db.transaction(() => {
      assert(
        !this.db.get('SELECT id FROM tenants WHERE slug=?', slug),
        409,
        'SLUG_TAKEN',
        'This workspace slug is already in use',
      );
      assert(
        this.db.get(
          'SELECT count(*) n FROM memberships WHERE user_id=? AND role=?',
          identity.userId,
          'owner',
        ).n < 20,
        429,
        'TENANT_QUOTA',
        'An account can create at most 20 workspaces',
      );
      const tenantId = id('ten');
      this.db.run(
        'INSERT INTO tenants(id,name,slug,created_at) VALUES(?,?,?,?)',
        tenantId,
        name,
        slug,
        this.clock(),
      );
      this.db.run(
        'INSERT INTO memberships VALUES(?,?,?,?)',
        tenantId,
        identity.userId,
        'owner',
        this.clock(),
      );
      this.store.audit({ tenantId, userId: identity.userId }, 'tenant.created', tenantId, { name });
      return { id: tenantId, name, slug, role: 'owner' };
    });
  }
  projects(identity, tenantId) {
    return listProjects(this.db, identity, tenantId).map(safeProject);
  }
  createProject(identity, tenantId, input) {
    const t = tenantAccess(this.db, identity, tenantId, 'manage');
    const name = text(input.name, 'Project name', { max: 100 });
    const slug = text(
      input.slug ??
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
      'Slug',
      { max: 70 },
    );
    assert(
      /^[a-z0-9][a-z0-9-]*$/.test(slug),
      400,
      'INVALID_SLUG',
      'Use lowercase letters, numbers and hyphens',
    );
    const description = text(input.description ?? '', 'Description', { min: 0, max: 1000 });
    return this.db.transaction(() => {
      assert(
        this.db.get(
          'SELECT count(*) n FROM projects WHERE tenant_id=? AND archived_at IS NULL',
          tenantId,
        ).n < t.project_limit,
        429,
        'PROJECT_QUOTA',
        'Workspace project limit reached',
      );
      assert(
        !this.db.get('SELECT id FROM projects WHERE tenant_id=? AND slug=?', tenantId, slug),
        409,
        'SLUG_TAKEN',
        'This project slug is already in use',
      );
      const projectId = id('prj');
      const settings = {
        separationOfDuties: true,
        allowedAdaptationLevel: 2,
        telemetryEnabled: false,
        allowedPiiFields: [],
        slots: [],
        componentMappings: {},
      };
      this.db.run(
        'INSERT INTO projects(tenant_id,id,name,slug,description,settings_json,created_at) VALUES(?,?,?,?,?,?,?)',
        tenantId,
        projectId,
        name,
        slug,
        description,
        JSON.stringify(settings),
        this.clock(),
      );
      const s = projectAccess(this.db, identity, tenantId, projectId, 'manage');
      this.rotateSigningKey(s);
      this.store.audit(s, 'project.created', projectId, { name });
      return safeProject(s.project);
    });
  }
  project(identity, t, p) {
    return safeProject(projectAccess(this.db, identity, t, p).project);
  }
  updateProject(identity, t, p, input) {
    const s = projectAccess(this.db, identity, t, p, 'manage');
    integer(input.revision, 'revision', 1);
    assert(
      input.revision === s.project.revision,
      409,
      'REVISION_CONFLICT',
      'The project was changed elsewhere. Reload and try again',
    );
    const name = input.name === undefined ? s.project.name : text(input.name, 'Name', { max: 100 });
    const description =
      input.description === undefined
        ? s.project.description
        : text(input.description, 'Description', { min: 0, max: 1000 });
    const settings = { ...parseJson(s.project.settings_json, {}) };
    if (input.settings) {
      object(input.settings);
      for (const k of Object.keys(input.settings))
        assert(
          [
            'separationOfDuties',
            'allowedAdaptationLevel',
            'telemetryEnabled',
            'slots',
            'allowedPiiFields',
            'componentMappings',
            'modelRouting',
            'visualReviewRequired',
          ].includes(k),
          400,
          'INVALID_SETTING',
          `Unknown project setting ${k}`,
        );
      if (input.settings.separationOfDuties !== undefined)
        settings.separationOfDuties = bool(input.settings.separationOfDuties);
      if (input.settings.visualReviewRequired !== undefined)
        settings.visualReviewRequired = bool(input.settings.visualReviewRequired);
      if (input.settings.modelRouting) {
        object(input.settings.modelRouting);
        settings.modelRouting = {};
        for (const [stage, v] of Object.entries(input.settings.modelRouting)) {
          choice(
            stage,
            ['architect', 'designer', 'critic', 'visual', 'component', 'agent'],
            'Model stage',
          );
          const c = this.db.get(
            'SELECT * FROM connections WHERE tenant_id=? AND id=? AND revoked_at IS NULL',
            t,
            v.connectionId,
          );
          assert(
            c && (!c.project_id || c.project_id === p),
            404,
            'NOT_FOUND',
            'Model connection not found',
          );
          settings.modelRouting[stage] = {
            connectionId: c.id,
            model: text(v.model, 'Model', { max: 150 }),
          };
        }
      }
      if (input.settings.telemetryEnabled !== undefined)
        settings.telemetryEnabled = bool(input.settings.telemetryEnabled);
      if (input.settings.allowedAdaptationLevel !== undefined)
        settings.allowedAdaptationLevel = integer(
          input.settings.allowedAdaptationLevel,
          'Adaptation level',
          0,
          3,
        );
      if (input.settings.allowedPiiFields)
        settings.allowedPiiFields = strings(input.settings.allowedPiiFields, 'PII fields');
      if (input.settings.componentMappings) {
        object(input.settings.componentMappings);
        settings.componentMappings = {};
        for (const [key, v] of Object.entries(input.settings.componentMappings)) {
          text(key, 'Component ID');
          settings.componentMappings[key] = text(v, 'Import path', { max: 200 });
        }
      }
      if (input.settings.slots) {
        assert(
          Array.isArray(input.settings.slots) && input.settings.slots.length <= 40,
          400,
          'INVALID_SLOTS',
          'At most 40 slots are permitted',
        );
        settings.slots = input.settings.slots.map((x) => ({
          id: text(x.id, 'Slot ID', { max: 100 }),
          mode: choice(x.mode, ['inline', 'route', 'drawer', 'modal', 'command'], 'Slot mode'),
          allowedCapabilityGroups: strings(x.allowedCapabilityGroups, 'Capability groups'),
          allowWriteActions: bool(x.allowWriteActions),
          allowedPiiFields: strings(x.allowedPiiFields ?? [], 'PII fields'),
          maxAdaptationLevel: integer(x.maxAdaptationLevel ?? 2, 'Adaptation level', 0, 3),
          fallback: 'host_ui',
          contextSchema: { type: 'object', additionalProperties: true },
        }));
      }
    }
    const providerId = input.providerId === undefined ? s.project.provider_id : input.providerId;
    if (providerId) {
      const c = this.db.get(
        'SELECT * FROM connections WHERE tenant_id=? AND id=? AND revoked_at IS NULL',
        t,
        providerId,
      );
      assert(
        c && (!c.project_id || c.project_id === p),
        404,
        'NOT_FOUND',
        'Provider connection not found',
      );
    }
    const model =
      input.model === undefined
        ? s.project.model_name
        : input.model
          ? text(input.model, 'Model', { max: 150 })
          : null;
    this.db.transaction(() => {
      const changed = this.db.run(
        'UPDATE projects SET name=?,description=?,settings_json=?,provider_id=?,model_name=?,revision=revision+1 WHERE tenant_id=? AND id=? AND revision=?',
        name,
        description,
        JSON.stringify(settings),
        providerId ?? null,
        model,
        t,
        p,
        input.revision,
      );
      assert(changed.changes === 1, 409, 'REVISION_CONFLICT', 'Project changed while saving');
      this.store.audit(s, 'project.updated', p, {
        fields: Object.keys(input).filter((x) => x !== 'revision'),
      });
    });
    return this.project(identity, t, p);
  }
  archiveProject(identity, t, p) {
    const s = projectAccess(this.db, identity, t, p, 'manage');
    this.db.transaction(() => {
      this.db.run(
        'UPDATE projects SET archived_at=?,revision=revision+1 WHERE tenant_id=? AND id=?',
        this.clock(),
        t,
        p,
      );
      this.db.run(
        "UPDATE jobs SET cancel_requested=1,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END WHERE tenant_id=? AND project_id=? AND status IN ('queued','running')",
        t,
        p,
      );
      this.db.run(
        'UPDATE api_tokens SET revoked_at=? WHERE tenant_id=? AND project_id=?',
        this.clock(),
        t,
        p,
      );
      this.store.audit(s, 'project.archived', p);
    });
    return { archived: true };
  }
  members(identity, t, p = null) {
    tenantAccess(this.db, identity, t, p ? 'read' : 'manage');
    if (p) projectAccess(this.db, identity, t, p, 'manage');
    return this.db
      .all(
        'SELECT u.id,u.email,u.display_name,m.role,pm.role project_role FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN project_members pm ON pm.tenant_id=m.tenant_id AND pm.user_id=m.user_id AND pm.project_id=? WHERE m.tenant_id=? ORDER BY u.display_name',
        p,
        t,
      )
      .map((r) => ({
        id: r.id,
        email: r.email,
        name: r.display_name,
        role: r.role,
        projectRole: r.project_role,
      }));
  }
  invite(identity, t, input) {
    tenantAccess(this.db, identity, t, 'manage');
    const mail = email(input.email);
    const role = choice(input.role ?? 'member', ['admin', 'member', 'viewer'], 'Workspace role');
    const p = input.projectId ?? null;
    const projectRole = p
      ? choice(
          input.projectRole ?? 'viewer',
          ['admin', 'editor', 'reviewer', 'viewer'],
          'Project role',
        )
      : null;
    if (p) projectAccess(this.db, identity, t, p, 'manage');
    const raw = token(),
      inviteId = id('inv');
    this.db.transaction(() => {
      this.db.run(
        'INSERT INTO invitations VALUES(?,?,?,?,?,?,?,?,?,?)',
        hash(raw),
        inviteId,
        t,
        p,
        mail,
        role,
        projectRole,
        identity.userId,
        this.clock() + 7 * 86400000,
        null,
      );
      this.store.audit(
        { tenantId: t, projectId: p, userId: identity.userId },
        'member.invited',
        inviteId,
        { role, projectRole },
      );
    });
    return { id: inviteId, invitationToken: raw, expiresAt: this.clock() + 7 * 86400000 };
  }
  async acceptInvite(input) {
    const raw = text(input.token, 'Invitation token', { max: 100 });
    const inv = this.db.get('SELECT * FROM invitations WHERE hash=?', hash(raw));
    assert(
      inv && !inv.used_at && inv.expires_at > this.clock(),
      400,
      'INVITATION_INVALID',
      'Invitation expired or already used',
    );
    let u = this.db.get('SELECT * FROM users WHERE email=? AND disabled_at IS NULL', inv.email);
    if (u)
      assert(
        await passwordMatches(input.password, u.password_hash),
        401,
        'INVALID_CREDENTIALS',
        'Sign in using your existing account password to accept',
      );
    else {
      const created = await this.auth.createUser({
        email: inv.email,
        password: input.password,
        displayName: input.displayName,
      });
      u = this.db.get('SELECT * FROM users WHERE id=?', created.id);
    }
    this.db.transaction(() => {
      const fresh = this.db.get(
        'SELECT * FROM invitations WHERE hash=? AND used_at IS NULL AND expires_at>?',
        hash(raw),
        this.clock(),
      );
      assert(fresh, 409, 'INVITATION_INVALID', 'Invitation was already used');
      tenantAccess(this.db, { userId: inv.invited_by }, inv.tenant_id, 'manage');
      this.db.run(
        'INSERT OR IGNORE INTO memberships VALUES(?,?,?,?)',
        inv.tenant_id,
        u.id,
        inv.role,
        this.clock(),
      );
      if (inv.project_id)
        this.db.run(
          'INSERT INTO project_members VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,project_id,user_id) DO UPDATE SET role=excluded.role',
          inv.tenant_id,
          inv.project_id,
          u.id,
          inv.project_role,
          this.clock(),
        );
      this.db.run('UPDATE invitations SET used_at=? WHERE hash=?', this.clock(), hash(raw));
      this.store.audit(
        { tenantId: inv.tenant_id, projectId: inv.project_id, userId: u.id },
        'member.joined',
        u.id,
        { role: inv.role },
      );
    });
    return { accepted: true, email: inv.email };
  }
  changeMember(identity, t, userId, input) {
    const tenant = tenantAccess(this.db, identity, t, 'manage');
    const target = this.db.get(
      'SELECT * FROM memberships WHERE tenant_id=? AND user_id=?',
      t,
      userId,
    );
    assert(target, 404, 'NOT_FOUND', 'Member not found');
    assert(
      target.role !== 'owner' || tenant.membership.role === 'owner',
      403,
      'OWNER_REQUIRED',
      'Only an owner can change another owner',
    );
    const role = input.remove
      ? null
      : choice(input.role, ['owner', 'admin', 'member', 'viewer'], 'Role');
    if (role === 'owner')
      assert(
        tenant.membership.role === 'owner',
        403,
        'OWNER_REQUIRED',
        'Only an owner can add another owner',
      );
    this.db.transaction(() => {
      if (target.role === 'owner' && role !== 'owner')
        assert(
          this.db.get("SELECT count(*) n FROM memberships WHERE tenant_id=? AND role='owner'", t)
            .n > 1,
          409,
          'LAST_OWNER',
          'A workspace must retain at least one owner',
        );
      if (role)
        this.db.run(
          'UPDATE memberships SET role=? WHERE tenant_id=? AND user_id=?',
          role,
          t,
          userId,
        );
      else {
        this.db.run('DELETE FROM project_members WHERE tenant_id=? AND user_id=?', t, userId);
        this.db.run('DELETE FROM memberships WHERE tenant_id=? AND user_id=?', t, userId);
      }
      this.db.run(
        'UPDATE api_tokens SET revoked_at=? WHERE tenant_id=? AND user_id=?',
        this.clock(),
        t,
        userId,
      );
      this.store.audit({ tenantId: t, userId: identity.userId }, 'member.access_changed', userId, {
        role,
        removed: !role,
      });
    });
    return { updated: true };
  }
  projectMember(identity, t, p, userId, input) {
    const s = projectAccess(this.db, identity, t, p, 'manage');
    assert(
      this.db.get('SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=?', t, userId),
      404,
      'NOT_FOUND',
      'Workspace member not found',
    );
    if (input.remove)
      this.db.run(
        'DELETE FROM project_members WHERE tenant_id=? AND project_id=? AND user_id=?',
        t,
        p,
        userId,
      );
    else {
      const role = choice(input.role, ['admin', 'editor', 'reviewer', 'viewer'], 'Project role');
      this.db.run(
        'INSERT INTO project_members VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,project_id,user_id) DO UPDATE SET role=excluded.role',
        t,
        p,
        userId,
        role,
        this.clock(),
      );
    }
    this.db.run(
      'UPDATE api_tokens SET revoked_at=? WHERE tenant_id=? AND project_id=? AND user_id=?',
      this.clock(),
      t,
      p,
      userId,
    );
    this.store.audit(s, 'project.member_changed', userId, {
      role: input.role ?? null,
      removed: !!input.remove,
    });
    return { updated: true };
  }
  createConnection(identity, t, input) {
    tenantAccess(this.db, identity, t, 'manage');
    const kind = choice(input.kind, [...API_KINDS, 'codex-cli', 'claude-cli'], 'Provider');
    const projectId = input.projectId ?? null;
    if (projectId) projectAccess(this.db, identity, t, projectId, 'manage');
    const name = text(input.name, 'Connection name', { max: 100 });
    const defaultModel = kind === 'claude-cli' ? 'claude-opus-4-8' : undefined;
    const config = { model: text(input.model ?? defaultModel, 'Model', { max: 150 }) };
    let secret = null;
    if (kind.endsWith('-cli')) {
      assert(projectId, 400, 'PROJECT_REQUIRED', 'CLI connections are bound to one project');
      const runnerId = text(input.runnerId, 'Runner ID');
      const r = this.db.get(
        'SELECT * FROM runners WHERE tenant_id=? AND project_id=? AND id=? AND revoked_at IS NULL',
        t,
        projectId,
        runnerId,
      );
      assert(
        r && parseJson(r.providers_json, []).includes(kind),
        404,
        'NOT_FOUND',
        'An authorized runner supporting this provider is required',
      );
      config.runnerId = runnerId;
      if (kind === 'claude-cli')
        config.effort = choice(
          input.effort ?? 'high',
          ['low', 'medium', 'high', 'xhigh', 'max'],
          'Claude effort',
        );
    } else {
      secret = text(input.apiKey, 'API key', { min: 8, max: 4096 });
      if (kind === 'openai-compatible') {
        let u;
        try {
          u = new URL(input.baseUrl);
        } catch {
          throw new AppError(400, 'INVALID_ENDPOINT', 'Enter an HTTPS API base URL');
        }
        assert(
          u.protocol === 'https:' &&
            !u.username &&
            !u.password &&
            !u.search &&
            !u.hash &&
            (!u.port || u.port === '443') &&
            this.allowedProviderHosts.includes(u.hostname),
          400,
          'EGRESS_DENIED',
          'Compatibility endpoints must use an operator-allowlisted HTTPS host',
        );
        config.baseUrl = u.href.replace(/\/$/, '');
      }
    }
    const connectionId = id('con'),
      now = this.clock();
    this.db.transaction(() => {
      this.db.run(
        'INSERT INTO connections VALUES(?,?,?,?,?,?,?,?,?,?)',
        t,
        connectionId,
        projectId,
        name,
        kind,
        JSON.stringify(config),
        secret ? this.box.seal(secret, `tenant:${t}:connection:${connectionId}`) : null,
        now,
        now,
        null,
      );
      this.store.audit(
        { tenantId: t, projectId, userId: identity.userId },
        'provider.created',
        connectionId,
        { kind },
      );
    });
    return safeConnection(
      this.db.get('SELECT * FROM connections WHERE tenant_id=? AND id=?', t, connectionId),
    );
  }
  connections(identity, t, p = null) {
    tenantAccess(this.db, identity, t);
    if (p) projectAccess(this.db, identity, t, p);
    else tenantAccess(this.db, identity, t, 'manage');
    return this.db
      .all(
        'SELECT * FROM connections WHERE tenant_id=? AND revoked_at IS NULL ORDER BY created_at DESC',
        t,
      )
      .filter((c) => !p || !c.project_id || c.project_id === p)
      .map(safeConnection);
  }
  revokeConnection(identity, t, connectionId) {
    tenantAccess(this.db, identity, t, 'manage');
    const c = this.db.get('SELECT * FROM connections WHERE tenant_id=? AND id=?', t, connectionId);
    assert(c, 404, 'NOT_FOUND', 'Connection not found');
    this.db.transaction(() => {
      this.db.run(
        'UPDATE connections SET revoked_at=?,secret_cipher=NULL WHERE tenant_id=? AND id=?',
        this.clock(),
        t,
        connectionId,
      );
      this.db.run('DELETE FROM model_cache WHERE tenant_id=?', t);
      this.store.audit({ tenantId: t, userId: identity.userId }, 'provider.revoked', connectionId);
    });
    return { revoked: true };
  }
  createToken(identity, t, p, input) {
    const s = projectAccess(this.db, identity, t, p, 'manage');
    assert(
      !identity.token,
      403,
      'SESSION_REQUIRED',
      'A browser session is required to issue credentials',
    );
    const scopes = strings(input.scopes ?? ['read'], 'Token scopes');
    assert(
      scopes.length &&
        scopes.every((x) => ['read', 'edit', 'run', 'publish', 'telemetry', 'agent'].includes(x)),
      400,
      'INVALID_SCOPES',
      'Unsupported token scope',
    );
    const raw = newApiToken(),
      tokenId = id('tok'),
      expires = this.clock() + integer(input.days ?? 30, 'Expiry days', 1, 90) * 86400000;
    this.db.run(
      'INSERT INTO api_tokens(hash,id,tenant_id,project_id,user_id,name,kind,scopes_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      hash(raw),
      tokenId,
      t,
      p,
      identity.userId,
      text(input.name, 'Token name', { max: 100 }),
      'project',
      JSON.stringify(scopes),
      expires,
      this.clock(),
    );
    this.store.audit(s, 'token.created', tokenId, { scopes, expiresAt: expires });
    return { id: tokenId, token: raw, expiresAt: expires };
  }
  tokens(identity, t, p) {
    projectAccess(this.db, identity, t, p, 'manage');
    return this.db
      .all(
        'SELECT id,name,kind,scopes_json,expires_at,created_at,last_used,revoked_at FROM api_tokens WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC',
        t,
        p,
      )
      .map((x) => ({ ...x, scopes: parseJson(x.scopes_json) }));
  }
  revokeToken(identity, t, p, tokenId) {
    const s = projectAccess(this.db, identity, t, p, 'manage');
    assert(
      this.db.run(
        'UPDATE api_tokens SET revoked_at=? WHERE tenant_id=? AND project_id=? AND id=?',
        this.clock(),
        t,
        p,
        tokenId,
      ).changes === 1,
      404,
      'NOT_FOUND',
      'Token not found',
    );
    this.store.audit(s, 'token.revoked', tokenId);
    return { revoked: true };
  }
  registerRunner(identity, t, p, input) {
    const s = projectAccess(this.db, identity, t, p, 'manage');
    assert(!identity.token, 403, 'SESSION_REQUIRED', 'A browser session is required');
    const providers = strings(input.providers ?? ['codex-cli', 'claude-cli'], 'Providers');
    assert(
      providers.length && providers.every((x) => ['codex-cli', 'claude-cli'].includes(x)),
      400,
      'INVALID_PROVIDER',
      'Unsupported runner provider',
    );
    const runnerId = id('run'),
      raw = newApiToken(),
      tokenId = id('tok'),
      name = text(input.name, 'Runner name', { max: 100 });
    const expires = this.clock() + 30 * 86400000;
    this.db.transaction(() => {
      this.db.run(
        'INSERT INTO runners VALUES(?,?,?,?,?,?,?,?)',
        t,
        p,
        runnerId,
        name,
        JSON.stringify(providers),
        null,
        null,
        this.clock(),
      );
      this.db.run(
        'INSERT INTO api_tokens(hash,id,tenant_id,project_id,user_id,name,kind,scopes_json,expires_at,created_at,runner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        hash(raw),
        tokenId,
        t,
        p,
        identity.userId,
        `Runner: ${name}`,
        'runner',
        JSON.stringify(['read', 'run']),
        expires,
        this.clock(),
        runnerId,
      );
      this.store.audit(s, 'runner.registered', runnerId, { providers });
    });
    return { id: runnerId, token: raw, expiresAt: expires, providers };
  }
  runners(identity, t, p) {
    projectAccess(this.db, identity, t, p);
    return this.db
      .all(
        'SELECT id,name,providers_json,last_seen,revoked_at,created_at FROM runners WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC',
        t,
        p,
      )
      .map((r) => ({
        ...r,
        providers: parseJson(r.providers_json, []),
        online: !!r.last_seen && r.last_seen > this.clock() - 60000 && !r.revoked_at,
      }));
  }
  revokeRunner(identity, t, p, runnerId) {
    const s = projectAccess(this.db, identity, t, p, 'manage');
    this.db.transaction(() => {
      assert(
        this.db.run(
          'UPDATE runners SET revoked_at=? WHERE tenant_id=? AND project_id=? AND id=?',
          this.clock(),
          t,
          p,
          runnerId,
        ).changes,
        404,
        'NOT_FOUND',
        'Runner not found',
      );
      this.db.run(
        'UPDATE api_tokens SET revoked_at=? WHERE tenant_id=? AND project_id=? AND runner_id=?',
        this.clock(),
        t,
        p,
        runnerId,
      );
      this.db.run(
        "UPDATE inference_tasks SET status='cancelled' WHERE tenant_id=? AND project_id=? AND runner_id=? AND status IN ('queued','running')",
        t,
        p,
        runnerId,
      );
      this.store.audit(s, 'runner.revoked', runnerId);
    });
    return { revoked: true };
  }
  runnerScope(identity) {
    assert(
      identity.token?.kind === 'runner' && identity.token.runner_id,
      403,
      'RUNNER_REQUIRED',
      'A project-bound runner token is required',
    );
    const t = identity.token;
    const scope = projectAccess(this.db, identity, t.tenant_id, t.project_id, 'run');
    const runner = this.db.get(
      'SELECT * FROM runners WHERE tenant_id=? AND project_id=? AND id=? AND revoked_at IS NULL',
      t.tenant_id,
      t.project_id,
      t.runner_id,
    );
    assert(runner, 403, 'RUNNER_REVOKED', 'Runner is revoked');
    return { ...scope, runner };
  }
  claimInference(identity, input = {}) {
    const s = this.runnerScope(identity),
      now = this.clock();
    const owner = text(input.workerId, 'Worker ID', { max: 100 });
    return this.db.transaction(() => {
      this.db.run(
        'UPDATE runners SET last_seen=? WHERE tenant_id=? AND project_id=? AND id=?',
        now,
        s.tenantId,
        s.projectId,
        s.runner.id,
      );
      const task = this.db.get(
        "SELECT i.* FROM inference_tasks i JOIN jobs j ON j.tenant_id=i.tenant_id AND j.project_id=i.project_id AND j.id=i.job_id WHERE i.tenant_id=? AND i.project_id=? AND i.runner_id=? AND i.expires_at>? AND (i.status='queued' OR (i.status='running' AND i.lease_until<?)) AND j.status='running' AND j.cancel_requested=0 ORDER BY i.created_at LIMIT 1",
        s.tenantId,
        s.projectId,
        s.runner.id,
        now,
        now,
      );
      if (!task) return { task: null };
      this.db.run(
        "UPDATE inference_tasks SET status='running',lease_owner=?,lease_until=?,fence=fence+1 WHERE tenant_id=? AND project_id=? AND id=?",
        owner,
        now + 30000,
        s.tenantId,
        s.projectId,
        task.id,
      );
      return {
        task: {
          id: task.id,
          provider: task.provider,
          request: parseJson(task.request_json),
          expiresAt: task.expires_at,
          fence: task.fence + 1,
        },
      };
    });
  }
  heartbeatInference(identity, taskId, input) {
    const s = this.runnerScope(identity),
      now = this.clock();
    const changed = this.db.run(
      "UPDATE inference_tasks SET lease_until=MIN(expires_at,?) WHERE tenant_id=? AND project_id=? AND id=? AND runner_id=? AND lease_owner=? AND fence=? AND status='running' AND expires_at>? AND lease_until>? AND EXISTS(SELECT 1 FROM jobs j WHERE j.tenant_id=inference_tasks.tenant_id AND j.project_id=inference_tasks.project_id AND j.id=inference_tasks.job_id AND j.status='running' AND j.cancel_requested=0)",
      now + 30000,
      s.tenantId,
      s.projectId,
      taskId,
      s.runner.id,
      input.workerId,
      input.fence,
      now,
      now,
    );
    assert(
      changed.changes === 1,
      409,
      'LEASE_LOST',
      'The task is cancelled, expired or owned by another runner',
    );
    return { active: true };
  }
  completeInference(identity, taskId, input) {
    const s = this.runnerScope(identity),
      now = this.clock();
    object(input);
    return this.db.transaction(() => {
      const task = this.db.get(
        "SELECT * FROM inference_tasks WHERE tenant_id=? AND project_id=? AND id=? AND runner_id=? AND lease_owner=? AND fence=? AND status='running' AND expires_at>? AND lease_until>?",
        s.tenantId,
        s.projectId,
        taskId,
        s.runner.id,
        input.workerId,
        input.fence,
        now,
        now,
      );
      assert(task, 409, 'LEASE_LOST', 'The task is expired or is no longer owned by this runner');
      const job = this.db.get(
        'SELECT status,cancel_requested FROM jobs WHERE tenant_id=? AND project_id=? AND id=?',
        s.tenantId,
        s.projectId,
        task.job_id,
      );
      assert(
        job?.status === 'running' && !job.cancel_requested,
        409,
        'JOB_CANCELLED',
        'The parent job has stopped',
      );
      let result = null,
        error = null;
      if (input.error)
        error = {
          code: text(input.error.code ?? 'RUNNER_ERROR', 'Error code', { max: 80 }),
          message: 'The project runner could not complete this inference. Inspect runner logs.',
        };
      else {
        object(input.result);
        validateOutput(input.result.value, parseJson(task.request_json).schema);
        const usage = {};
        for (const k of ['inputTokens', 'outputTokens'])
          if (input.result.usage?.[k] !== undefined)
            usage[k] = integer(input.result.usage[k], k, 0, 2000000);
        result = {
          value: input.result.value,
          usage,
          provider: task.provider,
          model: parseJson(task.request_json).model,
          durationMs: integer(input.result.durationMs ?? 0, 'Duration', 0, 600000),
        };
      }
      this.db.run(
        'UPDATE inference_tasks SET status=?,result_json=?,error_json=?,lease_until=NULL WHERE tenant_id=? AND project_id=? AND id=?',
        error ? 'failed' : 'succeeded',
        result ? JSON.stringify(result) : null,
        error ? JSON.stringify(error) : null,
        s.tenantId,
        s.projectId,
        taskId,
      );
      return { accepted: true };
    });
  }
  upload(identity, t, p, input, dedupe) {
    const s = projectAccess(this.db, identity, t, p, 'edit'),
      snapshot = validateSnapshot(input);
    const a = this.store.artifact(s, 'snapshot', snapshot);
    return safeJob(
      this.store.enqueue(
        s,
        'scan',
        { snapshotId: a.id },
        { dedupeKey: dedupe ?? `scan:${a.id}:${s.project.revision}` },
      ),
    );
  }
  model(identity, t, p) {
    const s = projectAccess(this.db, identity, t, p);
    if (!s.project.model_id) return null;
    return this.store.getArtifact(s, s.project.model_id, 'model').content;
  }
  openApi(identity, t, p) {
    const project = this.project(identity, t, p);
    const model = this.model(identity, t, p);
    assert(model, 409, 'MODEL_REQUIRED', 'Scan project sources before opening API reference');
    return createOpenApiDocument({ project, model });
  }
  search(identity, t, p, query) {
    const m = this.model(identity, t, p);
    return m ? searchProjectModel(m, text(query, 'Search query', { max: 300 }), { limit: 30 }) : [];
  }
  reviewCapability(identity, t, p, capId, input) {
    const s = projectAccess(this.db, identity, t, p, 'review');
    assert(s.project.model_id, 409, 'MODEL_REQUIRED', 'Scan sources before reviewing capabilities');
    const model = this.store.getArtifact(s, s.project.model_id, 'model').content;
    const c = model.capabilities.find((x) => x.id === capId);
    assert(c, 404, 'NOT_FOUND', 'Capability not found');
    const approved = input.approved !== false;
    const patch = {
      title:
        input.title === undefined ? c.title : text(input.title, 'Capability title', { max: 160 }),
      description:
        input.description === undefined
          ? c.description
          : text(input.description, 'Capability description', { max: 1000 }),
      risk: choice(input.risk, ['read_only', 'low', 'sensitive', 'destructive'], 'Risk'),
      confirmation: choice(
        input.confirmation,
        ['none', 'inline', 'modal', 'verbal_required'],
        'Confirmation',
      ),
      reversible: bool(input.reversible),
      requiredPermissions: strings(input.requiredPermissions ?? [], 'Permissions'),
      piiFields: strings(input.piiFields ?? c.piiFields ?? [], 'PII fields'),
      securityReviewed: approved,
      reviewDecision: approved ? 'approved' : 'rejected',
      agentEnabled: approved ? bool(input.agentEnabled ?? false) : false,
      reviewedBy: identity.userId,
      reviewedAt: this.clock(),
      reviewedSchemaHash: capabilityFingerprint(c),
    };
    assert(
      c.kind !== 'command' || patch.risk !== 'read_only',
      400,
      'UNSAFE_REVIEW',
      'A command cannot be classified as read-only',
    );
    assert(
      patch.risk !== 'destructive' || ['modal', 'verbal_required'].includes(patch.confirmation),
      400,
      'UNSAFE_REVIEW',
      'Destructive commands require modal or verbal confirmation',
    );
    assert(
      !patch.agentEnabled || approved,
      400,
      'AGENT_REQUIRES_APPROVAL',
      'Only an approved capability can be exposed to the chatbot',
    );
    if (patch.reversible && c.kind === 'command') {
      patch.rollbackCapabilityId = text(input.rollbackCapabilityId, 'Rollback capability');
      assert(
        model.capabilities.some((x) => x.id === patch.rollbackCapabilityId),
        400,
        'INVALID_ROLLBACK',
        'Rollback capability must be registered',
      );
    }
    Object.assign(c, patch);
    model.capabilityGraph = buildCapabilityGraph(model.capabilities, model.entities);
    model.searchIndex = buildSearchIndex(model);
    model.projectVersion = stableModelVersion(model);
    this.db.transaction(() => {
      const a = this.store.artifact(s, 'model', model);
      assert(
        this.db.run(
          'UPDATE projects SET model_id=?,revision=revision+1 WHERE tenant_id=? AND id=? AND revision=?',
          a.id,
          t,
          p,
          s.project.revision,
        ).changes === 1,
        409,
        'REVISION_CONFLICT',
        'Project changed while reviewing. Reload before retrying.',
      );
      this.store.audit(s, 'capability.reviewed', capId, {
        decision: patch.reviewDecision,
        agentEnabled: patch.agentEnabled,
        risk: patch.risk,
        confirmation: patch.confirmation,
      });
    });
    return { reviewed: true, projectVersion: model.projectVersion };
  }
  generate(identity, t, p, input, dedupe) {
    const s = projectAccess(this.db, identity, t, p, 'run');
    assert(s.project.model_id, 409, 'MODEL_REQUIRED', 'Add and scan project sources first');
    const model = this.store.getArtifact(s, s.project.model_id, 'model').content;
    const slotId = text(input.slotId, 'Slot ID', { max: 100 });
    assert(
      model.slots.some((x) => x.id === slotId),
      400,
      'SLOT_UNKNOWN',
      'Choose a registered slot',
    );
    const goal = text(input.goal, 'Goal', { min: 8, max: 2000 });
    const role = text(input.role ?? 'operator', 'Target role', { max: 80 });
    const permissions = strings(input.permissions ?? [], 'Target permissions');
    assert(
      permissions.every((x) => model.capabilities.some((c) => c.requiredPermissions.includes(x))),
      400,
      'UNKNOWN_PERMISSION',
      'Target permissions must appear in the project capability catalog',
    );
    const mode = choice(
      input.mode ?? (s.project.provider_id ? 'model' : 'deterministic'),
      ['model', 'deterministic'],
      'Generation mode',
    );
    if (mode === 'model')
      assert(
        s.project.provider_id,
        409,
        'PROVIDER_REQUIRED',
        'Select an API connection or CLI runner for this project',
      );
    return safeJob(
      this.store.enqueue(
        s,
        'generate',
        {
          modelId: s.project.model_id,
          slotId,
          goal,
          role,
          permissions,
          mode,
          variants: integer(input.variants ?? 3, 'Variants', 1, 3),
        },
        { dedupeKey: dedupe ?? id('generation') },
      ),
    );
  }
  queueVisualReview(identity, t, p, releaseId, input) {
    const scope = projectAccess(this.db, identity, t, p, 'run');
    const release = this.release(identity, t, p, releaseId);
    assert(
      scope.project.provider_id,
      409,
      'PROVIDER_REQUIRED',
      'Configure a vision-capable API connection; a visual stage override can be used with a CLI default',
    );
    const images = input.images;
    assert(
      Array.isArray(images) && images.length > 0 && images.length <= 4,
      400,
      'SCREENSHOTS_REQUIRED',
      'Supply one to four PNG/JPEG/WebP screenshot data URLs',
    );
    const checked = images.map((x) => {
      assert(
        typeof x.dataUrl === 'string' &&
          /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x.dataUrl) &&
          x.dataUrl.length <= 1500000,
        400,
        'INVALID_IMAGE',
        'Screenshots must be bounded image data URLs',
      );
      return {
        dataUrl: x.dataUrl,
        state: choice(
          x.state ?? 'ready',
          ['ready', 'loading', 'empty', 'error', 'mobile'],
          'Screenshot state',
        ),
      };
    });
    assert(
      input.redacted === true,
      400,
      'REDACTION_REQUIRED',
      'Confirm screenshots use redacted or synthetic data',
    );
    const artifact = this.store.artifact(scope, 'visual-input', {
      releaseId,
      artifactId: release.artifact_id,
      images: checked,
    });
    return safeJob(
      this.store.enqueue(scope, 'visual-review', {
        visualInputId: artifact.id,
        releaseId,
        artifactId: release.artifact_id,
      }),
    );
  }
  visualReviews(scope, artifactId) {
    return this.store
      .listArtifacts(scope, 'visual-review', 100)
      .map((x) => this.store.getArtifact(scope, x.id, 'visual-review').content)
      .filter((x) => x.artifactId === artifactId);
  }
  jobs(identity, t, p) {
    const s = projectAccess(this.db, identity, t, p);
    return this.db
      .all(
        'SELECT * FROM jobs WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC,id LIMIT 100',
        t,
        p,
      )
      .map(safeJob);
  }
  releases(identity, t, p) {
    projectAccess(this.db, identity, t, p);
    return this.db.all(
      'SELECT * FROM releases WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC,id LIMIT 100',
      t,
      p,
    );
  }
  release(identity, t, p, r) {
    const s = projectAccess(this.db, identity, t, p);
    const row = this.db.get(
      'SELECT * FROM releases WHERE tenant_id=? AND project_id=? AND id=?',
      t,
      p,
      r,
    );
    assert(row, 404, 'NOT_FOUND', 'Release not found');
    return {
      ...row,
      artifact: this.store.getArtifact(s, row.artifact_id, 'experience').content,
      visualReviews: this.visualReviews(s, row.artifact_id),
    };
  }
  approve(identity, t, p, r, input) {
    const s = projectAccess(this.db, identity, t, p, 'review');
    const row = this.release(identity, t, p, r);
    assert(row.status === 'draft', 409, 'RELEASE_STATE', 'Only a draft release can be reviewed');
    const separate = parseJson(s.project.settings_json, {}).separationOfDuties !== false;
    if (row.environment === 'production' && separate)
      assert(
        row.created_by !== identity.userId,
        403,
        'SEPARATION_OF_DUTIES',
        'A different reviewer must approve a production release',
      );
    const approved = bool(input.approved, true);
    const note = text(input.note ?? '', 'Review note', { min: 0, max: 1000 });
    if (approved) {
      this.validateRelease(s, row);
      assert(
        input.previewReviewed === true,
        400,
        'PREVIEW_REVIEW_REQUIRED',
        'Review the rendered preview, loading/empty/error states and keyboard interaction before approval',
      );
    }
    this.db.transaction(() => {
      const result = this.db.run(
        "UPDATE releases SET status=?,approved_by=?,approved_at=?,note=? WHERE tenant_id=? AND project_id=? AND id=? AND status='draft'",
        approved ? 'approved' : 'rejected',
        identity.userId,
        this.clock(),
        note,
        t,
        p,
        r,
      );
      assert(result.changes === 1, 409, 'RELEASE_STATE', 'Release was already reviewed');
      if (approved)
        this.db.run(
          'INSERT INTO release_reviews VALUES(?,?,?,?,?,?,?,?)',
          t,
          p,
          r,
          hash(row.artifact),
          identity.userId,
          this.clock(),
          1,
          note,
        );
      this.store.audit(s, approved ? 'release.approved' : 'release.rejected', r, {
        environment: row.environment,
      });
    });
    return { status: approved ? 'approved' : 'rejected' };
  }
  validateRelease(s, row) {
    const artifact =
      row.artifact ?? this.store.getArtifact(s, row.artifact_id, 'experience').content;
    const current = this.store.getArtifact(s, s.project.model_id, 'model').content;
    assert(
      artifact.bundle.tenantId === s.tenantId && artifact.bundle.projectId === s.projectId,
      409,
      'SCOPE_MISMATCH',
      'Release scope is invalid',
    );
    assert(
      artifact.bundle.projectVersion === current.projectVersion,
      409,
      'PROJECT_CHANGED',
      'Project model changed; generate and review a fresh release',
    );
    const evaluation = evaluateBundle(artifact.bundle, current);
    assert(
      evaluation.approved && artifact.evaluation?.approved,
      409,
      'QUALITY_GATE',
      'Release does not pass evaluation',
    );
    assert(
      artifact.bundle.experiencePlan.actionPlan.every((a) =>
        current.capabilities.some((c) => c.id === a.capabilityId && c.securityReviewed),
      ),
      409,
      'UNREVIEWED_ACTION',
      'All published actions must have a developer-reviewed security contract',
    );
    if (parseJson(s.project.settings_json, {}).visualReviewRequired) {
      const reviews = this.visualReviews(s, row.artifact_id);
      assert(
        reviews.some((x) => x.result.approved === true),
        409,
        'VISUAL_REVIEW_REQUIRED',
        'A passing screenshot critique for this exact artifact is required by project policy',
      );
    }
    return artifact;
  }
  publish(identity, t, p, r, input = {}) {
    const s = projectAccess(this.db, identity, t, p, 'publish');
    const row = this.release(identity, t, p, r);
    assert(
      row.status === 'approved',
      409,
      'RELEASE_STATE',
      'Approve the release before publishing',
    );
    projectAccess(this.db, { userId: row.approved_by }, t, p, 'review');
    const artifact = this.validateRelease(s, row);
    return this.db.transaction(() => {
      const current = this.db.get(
        'SELECT * FROM deployments WHERE tenant_id=? AND project_id=? AND slot_id=? AND environment=?',
        t,
        p,
        row.slot_id,
        row.environment,
      );
      if (input.revision !== undefined)
        assert(
          input.revision === (current?.revision ?? 0),
          409,
          'REVISION_CONFLICT',
          'Deployment changed. Reload before publishing',
        );
      const key = this.db.get(
        'SELECT * FROM signing_keys WHERE tenant_id=? AND project_id=? AND retired_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
        t,
        p,
      );
      assert(key, 409, 'SIGNING_KEY_REQUIRED', 'No active signing key');
      const review = this.db.get(
        'SELECT artifact_hash FROM release_reviews WHERE tenant_id=? AND project_id=? AND release_id=?',
        t,
        p,
        r,
      );
      assert(
        review?.artifact_hash === hash(artifact),
        409,
        'REVIEW_INVALID',
        'Review evidence does not match this artifact',
      );
      const fresh = this.db.get(
        'SELECT status FROM releases WHERE tenant_id=? AND project_id=? AND id=?',
        t,
        p,
        r,
      );
      assert(
        fresh?.status === 'approved',
        409,
        'RELEASE_STATE',
        'Release changed while publishing',
      );
      const freshProject = this.db.get(
        'SELECT model_id,revision FROM projects WHERE tenant_id=? AND id=?',
        t,
        p,
      );
      assert(
        freshProject.model_id === s.project.model_id &&
          freshProject.revision === s.project.revision,
        409,
        'REVISION_CONFLICT',
        'Project changed while publishing',
      );
      const unsigned = {
        ...artifact.bundle,
        tenantId: t,
        projectId: p,
        environment: row.environment,
        releaseId: r,
      };
      const signed = signBundle(unsigned, {
        privateKey: this.box.open(key.private_cipher, `tenant:${t}:project:${p}:signing:${key.id}`),
        keyId: key.id,
      });
      const rollout = integer(input.rolloutPercent ?? 100, 'Rollout percent', 0, 100);
      this.db.run(
        "UPDATE releases SET status='published',published_at=?,signature_json=? WHERE tenant_id=? AND project_id=? AND id=?",
        this.clock(),
        JSON.stringify(signed),
        t,
        p,
        r,
      );
      if (current) {
        this.db.run(
          "UPDATE releases SET status='superseded' WHERE tenant_id=? AND project_id=? AND id=?",
          t,
          p,
          current.release_id,
        );
        this.db.run(
          'UPDATE deployments SET previous_release_id=release_id,release_id=?,revision=revision+1,rollout_percent=?,updated_at=? WHERE tenant_id=? AND project_id=? AND slot_id=? AND environment=?',
          r,
          rollout,
          this.clock(),
          t,
          p,
          row.slot_id,
          row.environment,
        );
      } else
        this.db.run(
          'INSERT INTO deployments VALUES(?,?,?,?,?,?,?,?,?)',
          t,
          p,
          row.slot_id,
          row.environment,
          r,
          null,
          1,
          rollout,
          this.clock(),
        );
      this.store.audit(s, 'release.published', r, {
        environment: row.environment,
        rolloutPercent: rollout,
      });
      return {
        published: true,
        releaseId: r,
        bundleId: signed.bundleId,
        revision: (current?.revision ?? 0) + 1,
      };
    });
  }
  promote(identity, t, p, r) {
    const s = projectAccess(this.db, identity, t, p, 'publish');
    const row = this.release(identity, t, p, r);
    assert(
      row.environment === 'staging' && ['published', 'superseded'].includes(row.status),
      409,
      'RELEASE_STATE',
      'Publish to staging before promotion',
    );
    this.validateRelease(s, row);
    const next = id('rel');
    this.db.run(
      'INSERT INTO releases(tenant_id,project_id,id,artifact_id,slot_id,environment,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      t,
      p,
      next,
      row.artifact_id,
      row.slot_id,
      'production',
      'draft',
      identity.userId,
      this.clock(),
    );
    this.store.audit(s, 'release.promoted', next, { from: r });
    return { id: next, status: 'draft', environment: 'production' };
  }
  rollback(identity, t, p, { slotId, environment, revision }) {
    const s = projectAccess(this.db, identity, t, p, 'publish');
    choice(environment, ['staging', 'production'], 'Environment');
    return this.db.transaction(() => {
      const d = this.db.get(
        'SELECT * FROM deployments WHERE tenant_id=? AND project_id=? AND slot_id=? AND environment=?',
        t,
        p,
        slotId,
        environment,
      );
      assert(d?.previous_release_id, 409, 'NO_ROLLBACK', 'There is no prior deployment');
      assert(d.revision === revision, 409, 'REVISION_CONFLICT', 'Deployment changed');
      const row = this.release(identity, t, p, d.previous_release_id);
      this.validateRelease(s, row);
      const signed = JSON.parse(row.signature_json);
      verifySignedBundle(signed, this.publicKeys(s));
      this.db.run(
        'UPDATE deployments SET release_id=?,previous_release_id=?,revision=revision+1,rollout_percent=100,updated_at=? WHERE tenant_id=? AND project_id=? AND slot_id=? AND environment=?',
        d.previous_release_id,
        d.release_id,
        this.clock(),
        t,
        p,
        slotId,
        environment,
      );
      this.store.audit(s, 'deployment.rolled_back', d.previous_release_id, {
        from: d.release_id,
        environment,
      });
      return { releaseId: d.previous_release_id, revision: revision + 1 };
    });
  }
  rotateSigningKey(scope) {
    const s = requireScope(scope);
    const key = generateSigningKeyPair({ keyId: id('sig') });
    this.db.run(
      'UPDATE signing_keys SET retired_at=? WHERE tenant_id=? AND project_id=? AND retired_at IS NULL',
      this.clock(),
      s.tenantId,
      s.projectId,
    );
    this.db.run(
      'INSERT INTO signing_keys VALUES(?,?,?,?,?,?,?,?)',
      s.tenantId,
      s.projectId,
      key.keyId,
      key.publicKey,
      this.box.seal(
        key.privateKey,
        `tenant:${s.tenantId}:project:${s.projectId}:signing:${key.keyId}`,
      ),
      this.clock(),
      null,
      null,
    );
    this.store.audit(s, 'signing_key.rotated', key.keyId);
    return { id: key.keyId, publicKey: key.publicKey };
  }
  publicKeys(scope) {
    const s = requireScope(scope);
    return Object.fromEntries(
      this.db
        .all(
          'SELECT id,public_pem FROM signing_keys WHERE tenant_id=? AND project_id=? AND revoked_at IS NULL',
          s.tenantId,
          s.projectId,
        )
        .map((r) => [r.id, r.public_pem]),
    );
  }
  revokeSigningKey(identity, t, p, keyId) {
    const s = projectAccess(this.db, identity, t, p, 'manage');
    assert(
      this.db.run(
        'UPDATE signing_keys SET revoked_at=? WHERE tenant_id=? AND project_id=? AND id=?',
        this.clock(),
        t,
        p,
        keyId,
      ).changes,
      404,
      'NOT_FOUND',
      'Key not found',
    );
    this.store.audit(s, 'signing_key.revoked', keyId);
    return { revoked: true };
  }
  resolve(identity, t, p, input) {
    const s = projectAccess(this.db, identity, t, p);
    assert(
      identity.token?.kind === 'project',
      403,
      'SERVER_TOKEN_REQUIRED',
      'Bundle resolution is a host-server operation. Never put a project token in browser code',
    );
    const slotId = text(input.slotId, 'Slot ID');
    const environment = choice(
      input.environment ?? 'production',
      ['staging', 'production'],
      'Environment',
    );
    const d = this.db.get(
      'SELECT * FROM deployments WHERE tenant_id=? AND project_id=? AND slot_id=? AND environment=?',
      t,
      p,
      slotId,
      environment,
    );
    if (!d) return { source: 'host-fallback', bundle: null };
    const cohort = hash({
      tenant: t,
      project: p,
      slot: slotId,
      subject: text(input.subject ?? 'anonymous', 'Subject', { max: 200 }),
    });
    const useCurrent = parseInt(cohort.slice(0, 8), 16) % 100 < d.rollout_percent;
    const releaseId = useCurrent ? d.release_id : d.previous_release_id;
    if (!releaseId) return { source: 'host-fallback', bundle: null };
    const row = this.db.get(
      'SELECT * FROM releases WHERE tenant_id=? AND project_id=? AND id=?',
      t,
      p,
      releaseId,
    );
    const signed = parseJson(row?.signature_json);
    assert(signed, 409, 'INVALID_RELEASE', 'Published bundle is missing');
    const keys = this.publicKeys(s);
    try {
      verifySignedBundle(signed, keys);
    } catch {
      throw new AppError(
        410,
        'RELEASE_REVOKED',
        'Signing key was revoked or artifact verification failed',
      );
    }
    assert(
      signed.tenantId === t &&
        signed.projectId === p &&
        signed.slotId === slotId &&
        signed.environment === environment &&
        signed.releaseId === releaseId,
      409,
      'BUNDLE_SCOPE',
      'Published artifact scope is inconsistent',
    );
    const model = this.store.getArtifact(s, s.project.model_id, 'model').content;
    if (signed.projectVersion !== model.projectVersion)
      return { source: 'host-fallback', bundle: null, reason: 'project-version-changed' };
    const permissions = strings(input.permissions ?? [], 'Host permissions');
    if (signed.activation?.role && signed.activation.role !== input.role)
      return { source: 'host-fallback', bundle: null, reason: 'role-mismatch' };
    const needed = [
      ...new Set(
        [...signed.experiencePlan.queryPlan, ...signed.experiencePlan.actionPlan].flatMap(
          (a) => model.capabilities.find((c) => c.id === a.capabilityId)?.requiredPermissions ?? [],
        ),
      ),
    ];
    if (!needed.every((x) => permissions.includes(x)))
      return { source: 'host-fallback', bundle: null, reason: 'permission-mismatch' };
    return {
      source: 'published',
      bundle: signed,
      publicKeys: keys,
      deploymentRevision: d.revision,
      etag: hash({ releaseId, revision: d.revision, permissions, keys }),
      cacheControl: 'private, no-store',
    };
  }
  telemetry(identity, t, p, input) {
    const s = projectAccess(this.db, identity, t, p);
    if (identity.token)
      assert(
        parseJson(identity.token.scopes_json, []).includes('telemetry'),
        403,
        'TOKEN_SCOPE',
        'Telemetry scope is required',
      );
    assert(
      parseJson(s.project.settings_json, {}).telemetryEnabled,
      409,
      'TELEMETRY_DISABLED',
      'Enable semantic telemetry in project settings first',
    );
    assert(
      Array.isArray(input.events) && input.events.length <= 100,
      400,
      'INVALID_EVENTS',
      'At most 100 events per request',
    );
    const now = this.clock();
    const accepted = this.db.transaction(() => {
      let n = 0;
      for (const e of input.events) {
        const eventId = text(e.id ?? id('evt'), 'Event ID');
        const type = text(e.type, 'Event type', { max: 80 });
        assert(/^[a-z][a-z0-9_.-]*$/.test(type), 400, 'INVALID_EVENT', 'Use a semantic event name');
        const sessionId = hash(`${t}:${p}:${text(e.sessionId, 'Session ID', { max: 200 })}`);
        let route = text(e.route ?? '/', 'Route template', { max: 200 });
        route = route
          .split('/')
          .map((part) =>
            /^(?:[0-9]+|[0-9a-f]{8}-[0-9a-f-]{20,}|[A-Za-z0-9_-]{24,})$/i.test(part) ? ':id' : part,
          )
          .join('/');
        assert(
          !route.includes('?') && !route.includes('#') && !route.includes('@'),
          400,
          'PII_ROUTE',
          'Send route templates without queries or identifiers',
        );
        const metadata = {};
        for (const k of ['outcome', 'step', 'source', 'feature'])
          if (typeof e[k] === 'string') metadata[k] = text(e[k], k, { max: 80 });
        const occurredAt = integer(e.at ?? now, 'Event time', now - 7 * 86400000, now + 60000);
        n += this.db.run(
          'INSERT OR IGNORE INTO telemetry VALUES(?,?,?,?,?,?,?,?,?)',
          t,
          p,
          eventId,
          sessionId,
          type,
          route,
          JSON.stringify(metadata),
          occurredAt,
          now,
        ).changes;
      }
      return n;
    });
    return { accepted };
  }
  usage(identity, t, p) {
    projectAccess(this.db, identity, t, p);
    return this.db.all(
      'SELECT * FROM usage WHERE tenant_id=? AND project_id=? ORDER BY day DESC LIMIT 30',
      t,
      p,
    );
  }
  audit(identity, t, p = null, { after = 0, limit = 100 } = {}) {
    tenantAccess(this.db, identity, t, p ? 'read' : 'manage');
    if (p) projectAccess(this.db, identity, t, p);
    return this.db
      .all(
        `SELECT * FROM audit WHERE tenant_id=? ${p ? 'AND project_id=?' : ''} AND seq>? ORDER BY seq DESC LIMIT ?`,
        ...[t, ...(p ? [p] : []), after, Math.min(100, limit)],
      )
      .map((x) => ({ ...x, details: parseJson(x.details_json, {}) }));
  }
  overview(identity, t) {
    const projects = this.projects(identity, t);
    const allowed = new Set(projects.map((x) => x.id));
    const jobs = this.db
      .all(
        'SELECT project_id,status,count(*) n FROM jobs WHERE tenant_id=? GROUP BY project_id,status',
        t,
      )
      .filter((x) => allowed.has(x.project_id));
    const releases = this.db
      .all(
        "SELECT project_id,count(*) n FROM releases WHERE tenant_id=? AND status='published' GROUP BY project_id",
        t,
      )
      .filter((x) => allowed.has(x.project_id));
    const usage = this.db
      .all(
        'SELECT project_id,sum(input_tokens+output_tokens) tokens,sum(cache_hits) cache_hits,sum(calls) calls FROM usage WHERE tenant_id=? GROUP BY project_id',
        t,
      )
      .filter((x) => allowed.has(x.project_id));
    return {
      projects,
      metrics: {
        projects: projects.length,
        activeJobs: jobs
          .filter((x) => ['queued', 'running'].includes(x.status))
          .reduce((a, x) => a + x.n, 0),
        publishedSurfaces: releases.reduce((a, x) => a + x.n, 0),
        tokens: usage.reduce((a, x) => a + x.tokens, 0),
        cacheHits: usage.reduce((a, x) => a + x.cache_hits, 0),
        modelCalls: usage.reduce((a, x) => a + x.calls, 0),
      },
      recentJobs: this.db
        .all('SELECT * FROM jobs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100', t)
        .filter((x) => allowed.has(x.project_id))
        .slice(0, 6)
        .map(safeJob),
    };
  }
}
