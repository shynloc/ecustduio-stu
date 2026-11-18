CREATE TABLE context_refs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE knowledge_operations(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,undone INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE evidence_blocks(id TEXT PRIMARY KEY,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,source_hash TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX evidence_source ON evidence_blocks(source_kind,source_id,source_hash);
CREATE TABLE evidence_reviews(source_kind TEXT NOT NULL,source_id TEXT NOT NULL,source_hash TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(source_kind,source_id,source_hash,actor_id));
CREATE TABLE upload_sessions(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,size INTEGER NOT NULL,offset INTEGER NOT NULL DEFAULT 0,fingerprint TEXT NOT NULL,asset_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE pipeline_preferences(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);
CREATE TRIGGER note_material_changed AFTER UPDATE OF body,title,deleted ON notes WHEN NEW.body<>OLD.body OR NEW.title<>OLD.title OR NEW.deleted<>OLD.deleted BEGIN
 UPDATE versions SET stale=1 WHERE project_id IN (SELECT p.id FROM projects p,json_each(p.snapshot_ids) j JOIN note_materials nm ON nm.snapshot_id=j.value WHERE nm.note_id=NEW.id AND nm.revision<NEW.revision);
END;
CREATE TRIGGER snapshot_revision_changed AFTER INSERT ON snapshots WHEN NEW.previous_id IS NOT NULL BEGIN
 UPDATE versions SET stale=1 WHERE project_id IN (SELECT p.id FROM projects p,json_each(p.snapshot_ids) j WHERE j.value=NEW.previous_id);
END;
CREATE VIEW lineage_edges AS
 SELECT 'asset' parent_kind,asset_id parent_id,hash parent_revision,'snapshot' child_kind,id child_id FROM snapshots WHERE asset_id IS NOT NULL
 UNION ALL SELECT 'snapshot',snapshot_id,'','claim',id FROM claims
 UNION ALL SELECT 'claim',claim_id,'','version',version_id FROM version_claims
 UNION ALL SELECT 'snapshot',json_extract(j.value,'$.snapshotId'),coalesce(json_extract(j.value,'$.sourceHash'),''),'note',n.id FROM notes n,json_each(n.sources) j WHERE json_extract(j.value,'$.snapshotId') IS NOT NULL
 UNION ALL SELECT 'media',json_extract(j.value,'$.mediaJobId'),coalesce(json_extract(j.value,'$.sourceHash'),''),'note',n.id FROM notes n,json_each(n.sources) j WHERE json_extract(j.value,'$.mediaJobId') IS NOT NULL
 UNION ALL SELECT 'asset',json_extract(j.input,'$.file.id'),coalesce(json_extract(j.input,'$.file.hash'),''),'media',j.id FROM jobs j WHERE j.type='media' AND json_extract(j.input,'$.file.id') IS NOT NULL
 UNION ALL SELECT 'note',note_id,cast(revision AS TEXT),'snapshot',snapshot_id FROM note_materials
 UNION ALL SELECT 'snapshot',s.value,'','project',p.id FROM projects p,json_each(p.snapshot_ids) s
 UNION ALL SELECT 'project',project_id,'','version',id FROM versions
 UNION ALL SELECT 'version',master_id,'','version',id FROM versions WHERE master_id IS NOT NULL
 UNION ALL SELECT 'version',version_id,copy_hash,'visual',id FROM visual_drafts
 UNION ALL SELECT CASE WHEN EXISTS(SELECT 1 FROM versions WHERE versions.id=artifacts.target_id) THEN 'version' ELSE 'project' END,target_id,'','artifact',id FROM artifacts
 UNION ALL SELECT 'visual',json_extract(manifest,'$.visualId'),'','artifact',id FROM artifacts WHERE json_extract(manifest,'$.visualId') IS NOT NULL;
