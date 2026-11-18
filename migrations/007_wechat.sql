CREATE TABLE wechat_accounts(id TEXT PRIMARY KEY,app_id TEXT NOT NULL,display_name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,verified_at TEXT,created_at TEXT NOT NULL);
CREATE UNIQUE INDEX wechat_one_connection ON wechat_accounts(enabled) WHERE enabled=1;
CREATE TABLE wechat_previews(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),note_id TEXT NOT NULL REFERENCES notes(id),revision INTEGER NOT NULL,body TEXT NOT NULL,content_hash TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE wechat_drafts(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),preview_id TEXT NOT NULL REFERENCES wechat_previews(id),account_id TEXT NOT NULL REFERENCES wechat_accounts(id),job_id TEXT REFERENCES jobs(id),state TEXT NOT NULL DEFAULT 'queued',checkpoint TEXT NOT NULL DEFAULT '{}',remote_media_id TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(preview_id,account_id));
CREATE INDEX wechat_draft_owner ON wechat_drafts(owner_id,created_at);
