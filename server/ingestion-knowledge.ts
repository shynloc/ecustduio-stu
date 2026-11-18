import {get,run,id,now,json,parse,err} from './db.js';
import {saveDocument} from './knowledge.js';
export function archiveSnapshotToKnowledge(snapshotId:string,ownerId:string,folder='资料收件箱'){
 const s=get('SELECT * FROM snapshots WHERE id=?',snapshotId),user=get('SELECT role,status FROM users WHERE id=?',ownerId);if(!s||!user||user.status!=='active'||!['admin','creator'].includes(user.role))err('INVALID_OWNER','无法将资料归档到此账号',403);
 const old=get("SELECT id FROM notes n WHERE n.owner_id=? AND n.deleted=0 AND EXISTS(SELECT 1 FROM json_each(n.sources) j WHERE json_extract(j.value,'$.snapshotId')=?)",ownerId,snapshotId);if(old)return [old.id];
 const figures=parse(get("SELECT detail FROM audit WHERE action='snapshot.ingestion' AND entity_id=? ORDER BY created_at DESC LIMIT 1",snapshotId)?.detail).figures||[],parts:string[]=[];let body=s.body;
 while(body.length){let end=Math.min(95000,body.length);if(end<body.length){const newline=body.lastIndexOf('\n',end);if(newline>40000)end=newline;}parts.push(body.slice(0,end));body=body.slice(end);}
 return parts.map((part,index)=>{const nid=id();run('INSERT INTO notes(id,owner_id,title,body,sources,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',nid,ownerId,(s.title+(parts.length>1?`（${index+1}/${parts.length}）`:'' )).slice(0,200),part,json([{id:'S1',kind:'snapshot',snapshotId:s.id,sourceHash:s.hash,title:s.title,url:s.url,assetId:s.asset_id,needsReview:figures.length>0,section:parts.length>1?{index:index+1,total:parts.length}:undefined}]),now(),now());saveDocument({id:nid,revision:1},undefined,{folder,tags:[],purposes:[],state:figures.length?'needs-review':'inbox'});return nid;});
}
