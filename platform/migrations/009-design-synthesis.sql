CREATE TABLE design_syntheses (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
 contract_fingerprint TEXT NOT NULL, artifact_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('draft','approved','rejected')),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 reviewed_by TEXT, reviewed_at INTEGER,
 PRIMARY KEY(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,artifact_id) REFERENCES artifacts(tenant_id,project_id,id)
) STRICT;
CREATE INDEX design_syntheses_project
 ON design_syntheses(tenant_id,project_id,created_at DESC);
