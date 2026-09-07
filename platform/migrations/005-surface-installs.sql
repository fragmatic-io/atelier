CREATE TABLE surface_installs (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
 framework TEXT NOT NULL CHECK(framework IN('nextjs-app','react-router','dom')),
 mode TEXT NOT NULL CHECK(mode IN('route','inline','drawer')),
 application_origin TEXT NOT NULL, route_path TEXT NOT NULL, nav_label TEXT NOT NULL,
 bridge_path TEXT NOT NULL, slot_id TEXT NOT NULL,
 environment TEXT NOT NULL CHECK(environment IN('staging','production')),
 credential_hash TEXT NOT NULL UNIQUE, bundle_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('waiting','partial','verified','revoked')) DEFAULT 'waiting',
 route_mounted INTEGER NOT NULL DEFAULT 0 CHECK(route_mounted IN(0,1)),
 bridge_reachable INTEGER NOT NULL DEFAULT 0 CHECK(bridge_reachable IN(0,1)),
 authority_configured INTEGER NOT NULL DEFAULT 0 CHECK(authority_configured IN(0,1)),
 last_seen_at INTEGER, verified_at INTEGER, last_error TEXT,
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER,
 PRIMARY KEY(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE INDEX surface_installs_project
 ON surface_installs(tenant_id,project_id,created_at DESC);
