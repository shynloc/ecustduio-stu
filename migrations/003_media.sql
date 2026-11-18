CREATE TABLE media_assets(asset_id TEXT NOT NULL REFERENCES assets(id),owner_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(asset_id,owner_id));
CREATE TABLE media_jobs(job_id TEXT PRIMARY KEY REFERENCES jobs(id),owner_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
CREATE INDEX media_job_owner ON media_jobs(owner_id,created_at);
CREATE TABLE media_notes(job_id TEXT NOT NULL REFERENCES jobs(id),content_hash TEXT NOT NULL,note_id TEXT NOT NULL REFERENCES notes(id),PRIMARY KEY(job_id,content_hash));
CREATE TABLE media_materials(job_id TEXT NOT NULL REFERENCES jobs(id),content_hash TEXT NOT NULL,scope_hash TEXT NOT NULL,snapshot_id TEXT NOT NULL REFERENCES snapshots(id),PRIMARY KEY(job_id,content_hash,scope_hash));
