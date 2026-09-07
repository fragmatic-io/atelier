CREATE TABLE discovery_sources (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('browser','server','openapi','graphql')),
 name TEXT NOT NULL, credential_hash TEXT UNIQUE,
 allowed_origins_json TEXT NOT NULL DEFAULT '[]', config_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL CHECK(status IN('active','error','revoked')) DEFAULT 'active',
 last_seen_at INTEGER, last_error TEXT, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 revoked_at INTEGER, PRIMARY KEY(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
) STRICT;
CREATE INDEX discovery_sources_project ON discovery_sources(tenant_id,project_id,created_at DESC);

CREATE TABLE capability_observations (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, source_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, capability_key TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL,
 input_schema_json TEXT NOT NULL, output_schema_json TEXT NOT NULL,
 sample_json TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
 first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,source_id,fingerprint),
 FOREIGN KEY(tenant_id,project_id,source_id)
   REFERENCES discovery_sources(tenant_id,project_id,id) ON DELETE CASCADE
) STRICT;
CREATE INDEX capability_observations_operation
 ON capability_observations(tenant_id,project_id,capability_key,last_seen_at DESC);

CREATE TABLE capability_observation_contexts (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, source_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, context_hash TEXT NOT NULL, metadata_json TEXT NOT NULL,
 first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,source_id,fingerprint,context_hash),
 FOREIGN KEY(tenant_id,project_id,source_id,fingerprint)
   REFERENCES capability_observations(tenant_id,project_id,source_id,fingerprint) ON DELETE CASCADE
) STRICT;
