import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {openDatabase,migrate} from '../standalone/database.ts';
import {recallMemories,validateRecall} from '../lib/memory/recall.ts';

test('recall selects confirmed permitted memories and validates every citation',()=>{
 const mem=(id,status,sensitivity,statement)=>({id,status,sensitivity,statement,detail:'',topicTitle:'',updatedAt:'2026-11-04'});
 const rows=[mem('candidate','candidate','normal','产品实习'),mem('private','confirmed','private','产品实习'),mem('old','expired','normal','产品实习'),mem('valid','confirmed','normal','我在杭州找产品实习'),mem('other','confirmed','normal','我喜欢阅读')];
 assert.deepEqual(recallMemories(rows,'产品实习').selected.map(m=>m.id),['valid']);
 assert.ok(recallMemories(rows,'产品实习',true).selected.some(m=>m.id==='private'));
 assert.equal(recallMemories(rows,'完全无关的查询').matched,false);
 assert.throws(()=>validateRecall({answer:[{text:'内容',memoryIds:['invented']}],uncertainties:[],steps:[]},rows));
});

test('memory lifecycle, isolation, extraction, recall, correction and backup',async t=>{
 await mkdir('.sites-runtime',{recursive:true});const dir=await mkdtemp(resolve('.sites-runtime','memory-system-'));
 const url=pathToFileURL(join(dir,'db.sqlite')).href,base='http://127.0.0.1:18895';
 const storage=openDatabase({TURSO_DATABASE_URL:url,ALLOW_LOCAL_DB:'true'});await migrate(storage.client,[resolve('drizzle'),resolve('standalone/migrations')]);
 const cookies={};for(const who of ['alice','bob']){const token=randomBytes(32).toString('hex');cookies[who]='shiyan_session='+token;await storage.db.prepare('INSERT INTO shiyan_sessions(token_hash,owner_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),who,Date.now()+3600000).run();}
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:'18895',APP_BASE_URL:base,APP_PUBLIC_SIGNUP:'false',APP_ACCESS_PASSWORD:'test-only-long-owner-password',ALLOW_LOCAL_DB:'true',TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:'',MODEL_API_KEY:''};
 const server=spawn(process.execPath,['--import','./tests/fixtures/memory-upstream.mjs','standalone-dist/server.mjs'],{env,stdio:['ignore','pipe','pipe','ipc']});
 const call=(path,data,who='alice',method=data?'POST':'GET')=>fetch(base+path,{method,headers:{Cookie:cookies[who],...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const expect=async(path,data,status=200,who='alice',method)=>{const r=await call(path,data,who,method);const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result;};
 const model={provider:'glm',apiKey:'test-valid',model:'glm-5.3-flash'};
 let first,second,topic,source;
 try{
 await new Promise((ready,fail)=>{const timer=setTimeout(()=>fail(Error('startup timeout')),15000);server.stdout.on('data',x=>{if(String(x).includes('listening')){clearTimeout(timer);ready();}});server.once('exit',c=>{clearTimeout(timer);fail(Error('server exit '+c));});});
 await t.test('manual memories preserve sources, start unconfirmed and cannot cross accounts',async()=>{
  first=(await expect('/api/memories',{statement:'我想在杭州寻找产品实习',kind:'goal'},201)).memory;
  assert.equal(first.status,'candidate');assert.equal(first.evidence[0].speakerRole,'user');
  assert.equal((await expect('/api/memories',null,200,'bob')).memories.length,0);
  await expect('/api/memories/'+first.id,null,404,'bob');await expect('/api/memories/'+first.id,{action:'confirm'},404,'bob','PATCH');
  await expect('/api/memories/ask',{question:'我的产品实习方向',...model},422);
  await expect('/api/memories/'+first.id,{action:'confirm'},200,'alice','PATCH');
 });
 await t.test('private memories require per-request permission and every answer has actual evidence',async()=>{
  second=(await expect('/api/memories',{statement:'我希望产品实习能兼顾家庭安排',kind:'constraint',sensitivity:'private'},201)).memory;
  await expect('/api/memories/'+second.id,{action:'confirm'},200,'alice','PATCH');
  const answer=await expect('/api/memories/ask',{question:'产品实习',...model});assert.equal(answer.memories.length,1);assert.equal(answer.result.answer[0].memoryIds[0],first.id);
  const privateAnswer=await expect('/api/memories/ask',{question:'产品实习',includePrivate:true,...model});assert.equal(privateAnswer.memories.length,2);
  await expect('/api/memories/ask',{question:'产品实习',...model,apiKey:'test-badrefs'},502);
  assert.equal((await expect('/api/memories/ask',{question:'产品实习',mode:'plan',...model})).result.steps.length,1);
 });
 await t.test('revisions remain inspectable; revised or expired memories stop participating',async()=>{
  await expect('/api/memories/'+first.id,{action:'revise',statement:'我想在杭州寻找产品实习并完成作品集'},200,'alice','PATCH');
  const history=await expect('/api/memories/'+first.id);assert.equal(history.revisions.length,2);assert.ok(history.revisions.some(r=>JSON.parse(r.beforeJson).statement===first.statement));
  await expect('/api/memories/ask',{question:'产品实习',...model},422);
  await expect('/api/memories/'+first.id,{action:'confirm'},200,'alice','PATCH');
  await expect('/api/memories/'+first.id,{action:'expire'},200,'alice','PATCH');await expect('/api/memories/ask',{question:'产品实习',...model},422);
  await expect('/api/memories/'+first.id,{action:'confirm'},200,'alice','PATCH');
 });
 await t.test('withdrawals during an upstream call reject stale answers',async()=>{
  const waiting=new Promise(done=>{const listener=m=>{if(m.type==='recall-waiting'){server.off('message',listener);done();}};server.on('message',listener);});
  const request=call('/api/memories/ask',{question:'产品实习',...model,apiKey:'test-race'});await waiting;
  await expect('/api/memories/ask',{question:'产品实习',...model},429);
  await expect('/api/memories/ask',{question:'产品实习',...model},422,'bob');
  await expect('/api/memories/'+first.id,{action:'retract'},200,'alice','PATCH');assert.equal((await request).status,409);
  await expect('/api/memories/ask',{question:'产品实习',...model},422);
 });
 await t.test('extraction rejects fabricated quotes and AI attribution; completed empty results are not retried',async()=>{
  topic=(await expect('/api/topics',{title:'记忆测试虚构资料'},201)).topic.id;
  source=(await expect(`/api/topics/${topic}/conversations`,{title:'虚构经历',source:'豆包',content:'用户：我想在杭州寻找产品实习。\nAI：你必须立即转行。'},201)).id;
  const result=await expect('/api/memories/extract',{topicId:topic,...model},201);assert.equal(result.processed,1);assert.ok(result.rejected.includes('找不到'));assert.ok(result.rejected.includes('AI'));
  await expect('/api/memories/extract',{topicId:topic,...model},409);
  await expect('/api/memories/extract',{conversationId:source,...model},201);
  const evidence=(await expect('/api/memories')).memories.find(m=>m.sourceConversationId===source);assert.equal(evidence.evidence.length,1);
  const emptyTopic=(await expect('/api/topics',{title:'空记忆测试'},201)).topic.id;
  await expect(`/api/topics/${emptyTopic}/conversations`,{title:'纯知识对话',source:'ChatGPT',content:'用户：请解释一下什么是计算机网络。'},201);
  await expect('/api/memories/extract',{topicId:emptyTopic,...model,apiKey:'test-empty'},201);await expect('/api/memories/extract',{topicId:emptyTopic,...model},409);
 });
 await t.test('deleting a primary source preserves independent evidence; removing all sources deletes memories',async()=>{
  const extracted=(await expect('/api/memories')).memories.find(m=>m.sourceConversationId===source);
  const other=(await expect(`/api/topics/${topic}/conversations`,{title:'第二份虚构经历',source:'DeepSeek',content:'用户：我想在杭州寻找产品实习。\nAI：建议先访谈。'},201)).id;
  await expect('/api/memories/extract',{conversationId:other,...model},201);
  await expect('/api/conversations/'+source,null,200,'alice','DELETE');
  const retained=(await expect('/api/memories/'+extracted.id)).memory;assert.equal(retained.evidence.length,1);assert.equal(retained.sourceConversationId,other);
  await expect('/api/topics/'+topic,null,200,'alice','DELETE');await expect('/api/memories/'+extracted.id,null,404);
 });
 await t.test('version 3 backup preserves memory evidence, history and extraction receipts',async()=>{
  const backup=join(dir,'backup.json');let child=spawnSync(process.execPath,['scripts/transfer-data.mjs','export',backup],{env,encoding:'utf8'});assert.equal(child.status,0,child.stderr);
  const exported=JSON.parse(await readFile(backup,'utf8'));assert.equal(exported.version,3);assert.ok(exported.tables.memory_revisions.length>0);
  const target=pathToFileURL(join(dir,'restored.sqlite')).href;
  child=spawnSync(process.execPath,['scripts/transfer-data.mjs','import',backup],{env:{...env,TURSO_DATABASE_URL:target},encoding:'utf8'});assert.equal(child.status,0,child.stderr);
  const db=openDatabase({TURSO_DATABASE_URL:target,ALLOW_LOCAL_DB:'true'});assert.equal((await db.client.execute('SELECT COUNT(*) AS n FROM memories')).rows[0].n,exported.tables.memories.length);db.client.close();
 });
 }finally{if(server.exitCode===null){const end=new Promise(done=>server.once('exit',done));server.kill();await end;}storage.client.close();}
});
