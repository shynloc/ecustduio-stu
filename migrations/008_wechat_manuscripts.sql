CREATE TABLE wechat_manuscripts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT '',
  origin_note_id TEXT REFERENCES notes(id),
  note_id TEXT REFERENCES notes(id),
  preview_id TEXT REFERENCES wechat_previews(id),
  updated_at TEXT NOT NULL
);
CREATE INDEX wechat_manuscript_owner ON wechat_manuscripts(owner_id,updated_at);
CREATE UNIQUE INDEX wechat_manuscript_origin ON wechat_manuscripts(owner_id,origin) WHERE origin <> '';
