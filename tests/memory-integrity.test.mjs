import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDatabase,migrate} from '../standalone/database.ts';
import {saveAcceptedMemories,searchMemories,listMemories} from '../lib/memory/repo.ts';
import {memoryIdentityKey,KEY_IGNORED} from '../lib/memory/merge.ts';

await mkdir('.sites-runtime',{recursive:true});
const dir=await mkdtemp(resolve('.sites-runtime','integrity-'));
async function fixture(name){const f=openDatabase({TURSO_DATABASE_URL:pathToFileURL(join(dir,name+'.sqlite')).href,ALLOW_LOCAL_DB:'true'});await migrate(f.client,[resolve('drizzle'),resolve('standalone/migrations')]);return f;}
const source=async(db,id,owner='alice',content=id)=>{
 await db.prepare("INSERT OR IGNORE INTO topics(id,owner_id,title,created_at,updated_at) VALUES(?,?,'资料','2026','2026')").bind('t-'+owner,owner).run();
 await db.prepare("INSERT INTO conversations(id,topic_id,title,source,content,content_hash,imported_at) VALUES(?,?,'测试','其他',?,?,'2026-01-01')").bind(id,'t-'+owner,content,content).run();
};
const accepted=(conversationId,extra={})=>({conversationId,start:0,end:8,role:'user',confidence:'low',draft:{kind:'event',statement:'我完成一次访谈',detail:'',occurredAt:null,occurredPrecision:'unknown',basis:'stated',quote:'我完成一次访谈',sensitivity:'normal',...extra}});
test('different event dates do not merge and repeated evidence does not duplicate',async()=>{
 const {db,client}=await fixture('dates');try{
  await source(db,'c1');await source(db,'c2');
  await saveAcceptedMemories(db,'alice',[accepted('c1',{occurredAt:'2025-01'}),accepted('c2',{occurredAt:'2026-01'})]);
  const rows=await listMemories(db,'alice');assert.equal(rows.length,2);
  await saveAcceptedMemories(db,'alice',[accepted('c1',{occurredAt:'2025-01'})]);
  assert.equal((await listMemories(db,'alice')).find(m=>m.occurredAt==='2025-01').evidence.length,1);
 }finally{client.close();}
});
test('new evidence atomically revokes confirmation and raises privacy without downgrades',async()=>{
 const {db,client}=await fixture('privacy');try{
  for(const id of ['c1','c2','c3','c4'])await source(db,id);
  const first=await saveAcceptedMemories(db,'alice',[accepted('c1')]);const id=first.touched[0];
  await db.prepare("UPDATE memories SET status='confirmed' WHERE id=?").bind(id).run();
  await saveAcceptedMemories(db,'alice',[accepted('c2',{sensitivity:'sensitive'})]);
  let m=(await listMemories(db,'alice'))[0];assert.equal(m.status,'candidate');assert.equal(m.sensitivity,'sensitive');assert.equal(m.evidence.length,2);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM memory_revisions').first()).n,1);
  await saveAcceptedMemories(db,'alice',[accepted('c3',{sensitivity:'private'}),accepted('c4')]);
  m=(await listMemories(db,'alice'))[0];assert.equal(m.sensitivity,'sensitive');
  assert.equal((await searchMemories(db,'alice','访谈',true)).selected.length,0);
 }finally{client.close();}
});
test('full-corpus retrieval finds old memory beyond 500; filters ownership and privacy first',async()=>{
 const {db,client}=await fixture('retrieval');try{
  await source(db,'ca');await source(db,'cb','bob');
  const statements=Array.from({length:1001},(_,i)=>db.prepare(`INSERT INTO memories(id,owner_id,kind,statement,statement_key,status,sensitivity,source_conversation_id,created_at,updated_at)
   VALUES(?,'alice','event',?,?,'confirmed','normal','ca',?,?)`).bind('m'+i,i===0?'我在敦煌研究壁画':'我每天写作第'+i+'条','k'+i,'2026-01-'+String(i).padStart(4,'0'),'2026-01-'+String(i).padStart(4,'0')));
  await db.batch(statements);
  let r=await searchMemories(db,'alice','敦煌壁画',false);assert.equal(r.selected[0].id,'m0');assert.equal(r.eligible,1001);
  assert.equal((await searchMemories(db,'bob','敦煌壁画',true)).selected.length,0);
  await db.prepare("UPDATE memories SET sensitivity='private' WHERE id='m0'").run();
  assert.equal((await searchMemories(db,'alice','敦煌壁画',false)).selected.length,0);
  assert.equal((await searchMemories(db,'alice','敦煌壁画',true)).selected[0].id,'m0');
 }finally{client.close();}
});
test('upgrading populated v1.3 databases preserves IDs, evidence and SQL/JS identity parity',async()=>{
 const legacy=join(dir,'legacy');await mkdir(legacy);
 for(const f of ['0000_gorgeous_la_nuit.sql','0001_rich_jasper_sitwell.sql','0002_memory_runtime.sql'])await copyFile(join(resolve('drizzle'),f),join(legacy,f));
 const {db,client}=openDatabase({TURSO_DATABASE_URL:pathToFileURL(join(dir,'upgrade.sqlite')).href,ALLOW_LOCAL_DB:'true'});
 try{
  await migrate(client,[legacy,resolve('standalone/migrations')]);await source(db,'ca');
  const statement='我会C++，绩点3.5'+KEY_IGNORED+'ABC';
  await db.prepare("INSERT INTO memories(id,owner_id,kind,statement,statement_key,source_conversation_id,occurred_at,source_role,created_at,updated_at) VALUES('old','alice','event',?,'old-key','ca','2025-01','user','2026','2026')").bind(statement).run();
  await db.prepare("INSERT INTO memory_evidence(id,memory_id,conversation_id,quote,created_at) VALUES('e','old','ca','证据','2026')").run();
  await migrate(client,[resolve('drizzle'),resolve('standalone/migrations')]);
  assert.equal((await db.prepare("SELECT statement_key AS k FROM memories WHERE id='old'").first()).k,memoryIdentityKey(statement,'2025-01','user'));
  assert.equal((await listMemories(db,'alice'))[0].evidence[0].id,'e');
 }finally{client.close();}
});
