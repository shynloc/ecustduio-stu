CREATE TABLE collection_folders(
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('notes','conversations','artifacts')),
 parent_id TEXT REFERENCES collection_folders(id) ON DELETE SET NULL, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX collection_folder_name ON collection_folders(owner_id,kind,coalesce(parent_id,''),name);
CREATE TABLE collection_items(
 owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, entity_id TEXT NOT NULL,
 folder_id TEXT REFERENCES collection_folders(id) ON DELETE SET NULL, tags TEXT NOT NULL DEFAULT '[]',
 favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
 display_name TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,kind,entity_id)
);
CREATE INDEX collection_item_folder ON collection_items(owner_id,kind,folder_id);
CREATE TABLE collection_operations(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,body TEXT NOT NULL,undone INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE collection_selections(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE workspace_preferences(owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(owner_id,name));
CREATE TABLE conversation_summaries(conversation_id TEXT NOT NULL REFERENCES conversations(id),through_message_id TEXT NOT NULL,source_hash TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(conversation_id,source_hash));

INSERT INTO collection_folders(id,owner_id,kind,name,created_at)
 SELECT lower(hex(randomblob(16))),n.owner_id,'notes',c.folder,strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM note_categories c JOIN notes n ON n.id=c.note_id WHERE c.folder<>'' GROUP BY n.owner_id,c.folder;
INSERT INTO collection_items(owner_id,kind,entity_id,folder_id,tags,archived,deleted,updated_at)
 SELECT n.owner_id,'notes',n.id,f.id,coalesce(c.tags,'[]'),CASE WHEN c.state='archived' THEN 1 ELSE 0 END,n.deleted,n.updated_at
 FROM notes n LEFT JOIN note_categories c ON c.note_id=n.id LEFT JOIN collection_folders f ON f.owner_id=n.owner_id AND f.kind='notes' AND f.name=c.folder;
INSERT INTO collection_items(owner_id,kind,entity_id,updated_at)
 SELECT owner_id,'conversations',id,updated_at FROM conversations;
