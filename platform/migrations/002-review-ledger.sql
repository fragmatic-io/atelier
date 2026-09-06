CREATE TABLE release_reviews (
 tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, release_id TEXT NOT NULL,
 artifact_hash TEXT NOT NULL, reviewer_id TEXT NOT NULL, reviewed_at INTEGER NOT NULL,
 preview_reviewed INTEGER NOT NULL CHECK(preview_reviewed=1), note TEXT NOT NULL,
 PRIMARY KEY(tenant_id,project_id,release_id),
 FOREIGN KEY(tenant_id,project_id,release_id) REFERENCES releases(tenant_id,project_id,id)
) STRICT;
CREATE TRIGGER reviews_immutable BEFORE UPDATE ON release_reviews BEGIN SELECT RAISE(ABORT,'Review evidence is immutable'); END;
