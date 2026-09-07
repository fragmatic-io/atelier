CREATE TABLE design_observations (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, source_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, contract_json TEXT NOT NULL,
 approved_contract_json TEXT, approved_by TEXT, approved_at INTEGER,
 first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,project_id,source_id,fingerprint),
 FOREIGN KEY(tenant_id,project_id,source_id)
   REFERENCES discovery_sources(tenant_id,project_id,id) ON DELETE CASCADE
) STRICT;
CREATE INDEX design_observations_project
 ON design_observations(tenant_id,project_id,last_seen_at DESC);

ALTER TABLE surface_installs ADD COLUMN design_fingerprint TEXT;
