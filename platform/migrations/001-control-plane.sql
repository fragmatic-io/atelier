CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL, mfa_secret TEXT, mfa_pending TEXT, mfa_counter INTEGER NOT NULL DEFAULT -1,
 recovery_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, disabled_at INTEGER
) STRICT;
CREATE TABLE sessions (
 hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE tenants (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
 project_limit INTEGER NOT NULL DEFAULT 50 CHECK(project_limit BETWEEN 1 AND 1000),
 daily_token_limit INTEGER NOT NULL DEFAULT 500000 CHECK(daily_token_limit>=0),
 audit_head TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, deleted_at INTEGER
) STRICT;
CREATE TABLE memberships (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')), created_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,user_id)
) STRICT;
CREATE TABLE projects (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, name TEXT NOT NULL,
 slug TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', model_id TEXT,
 provider_id TEXT, model_name TEXT, settings_json TEXT NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, archived_at INTEGER,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,slug)
) STRICT;
CREATE TABLE project_members (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','editor','reviewer','viewer')), created_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,user_id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
) STRICT;
CREATE TABLE invitations (
 hash TEXT PRIMARY KEY, id TEXT NOT NULL, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 project_id TEXT, email TEXT NOT NULL, role TEXT NOT NULL, project_role TEXT,
 invited_by TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, used_at INTEGER,
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE TABLE api_tokens (
 hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('project','runner')),
 scopes_json TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 revoked_at INTEGER, last_used INTEGER, runner_id TEXT,
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE TABLE runners (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
 providers_json TEXT NOT NULL, last_seen INTEGER, revoked_at INTEGER, created_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE TABLE connections (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, project_id TEXT,
 name TEXT NOT NULL, kind TEXT NOT NULL, config_json TEXT NOT NULL, secret_cipher TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revoked_at INTEGER,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE TABLE artifacts (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
 kind TEXT NOT NULL, content_json TEXT NOT NULL, content_hash TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE INDEX artifacts_project ON artifacts(tenant_id,project_id,kind,created_at DESC);
CREATE TRIGGER artifacts_immutable_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT,'Artifacts are immutable'); END;
CREATE TABLE jobs (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
 input_json TEXT NOT NULL, result_json TEXT, error_json TEXT, trace_json TEXT NOT NULL DEFAULT '[]',
 stage TEXT NOT NULL DEFAULT 'queued', created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 2,
 lease_owner TEXT, lease_until INTEGER, fence INTEGER NOT NULL DEFAULT 0,
 dedupe_key TEXT NOT NULL, cancel_requested INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,project_id,id), UNIQUE(tenant_id,project_id,dedupe_key),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE INDEX jobs_claim ON jobs(status,lease_until,created_at);
CREATE TABLE inference_tasks (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
 runner_id TEXT NOT NULL, provider TEXT NOT NULL, job_id TEXT NOT NULL,
 request_json TEXT NOT NULL, result_json TEXT, error_json TEXT,
 status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
 lease_owner TEXT, lease_until INTEGER, fence INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,runner_id) REFERENCES runners(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,job_id) REFERENCES jobs(tenant_id,project_id,id)
) STRICT;
CREATE TABLE model_cache (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, cache_key TEXT NOT NULL,
 result_json TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,cache_key), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE TABLE usage (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, day TEXT NOT NULL,
 calls INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0,
 output_tokens INTEGER NOT NULL DEFAULT 0, reserved_tokens INTEGER NOT NULL DEFAULT 0,
 cache_hits INTEGER NOT NULL DEFAULT 0, unknown_usage_calls INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,project_id,day), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE TABLE reservations (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL, day TEXT NOT NULL,
 amount INTEGER NOT NULL, settled_at INTEGER, created_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE TABLE signing_keys (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
 public_pem TEXT NOT NULL, private_cipher TEXT NOT NULL, created_at INTEGER NOT NULL,
 retired_at INTEGER, revoked_at INTEGER,
 PRIMARY KEY(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE TABLE releases (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
 artifact_id TEXT NOT NULL, slot_id TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
 status TEXT NOT NULL CHECK(status IN ('draft','approved','rejected','published','superseded')),
 created_by TEXT NOT NULL, approved_by TEXT, approved_at INTEGER, note TEXT,
 created_at INTEGER NOT NULL, published_at INTEGER, signature_json TEXT,
 PRIMARY KEY(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,artifact_id) REFERENCES artifacts(tenant_id,project_id,id)
) STRICT;
CREATE TABLE deployments (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, slot_id TEXT NOT NULL, environment TEXT NOT NULL,
 release_id TEXT NOT NULL, previous_release_id TEXT, revision INTEGER NOT NULL DEFAULT 1,
 rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK(rollout_percent BETWEEN 0 AND 100),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,slot_id,environment),
 FOREIGN KEY(tenant_id,project_id,release_id) REFERENCES releases(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,previous_release_id) REFERENCES releases(tenant_id,project_id,id)
) STRICT;
CREATE TABLE telemetry (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL, session_id TEXT NOT NULL,
 type TEXT NOT NULL, route TEXT, metadata_json TEXT NOT NULL, occurred_at INTEGER NOT NULL, received_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE INDEX telemetry_session ON telemetry(tenant_id,project_id,session_id,occurred_at);
CREATE TABLE audit (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), seq INTEGER NOT NULL, id TEXT NOT NULL,
 project_id TEXT, actor_id TEXT NOT NULL, action TEXT NOT NULL, resource_id TEXT,
 details_json TEXT NOT NULL, created_at INTEGER NOT NULL, prev_hash TEXT NOT NULL, row_hash TEXT NOT NULL,
 PRIMARY KEY(tenant_id,seq), UNIQUE(tenant_id,id)
) STRICT;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;
CREATE TABLE rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL) STRICT;
CREATE TABLE idempotency (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, actor_id TEXT NOT NULL, request_key TEXT NOT NULL,
 request_hash TEXT NOT NULL, response_json TEXT NOT NULL, status INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, PRIMARY KEY(tenant_id,project_id,actor_id,request_key),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
