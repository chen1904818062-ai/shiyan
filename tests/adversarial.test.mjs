import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMemoryDrafts } from '../lib/memory/validate.ts';
import { statementKey, mergeDrafts } from '../lib/memory/merge.ts';
import { scoreConfidence } from '../lib/memory/confidence.ts';
import { recallMemories, validateRecall } from '../lib/memory/recall.ts';
import { upstreamJson } from '../lib/upstream-json.ts';

const draft = (extra={}) => ({kind:'event',statement:'我完成了一次产品访谈',detail:'',occurredAt:null,occurredPrecision:'unknown',basis:'stated',quote:'我完成了一次产品访谈',sensitivity:'normal',...extra});
test('reject malformed empty envelopes instead of marking extraction complete',()=>{
  const r=validateMemoryDrafts({memories:[],unexpected:true},{id:'c',content:'用户：我完成了一次产品访谈。'});
  assert.ok(r.rejected.invalid>0);
});
test('shared wording across speakers cannot authenticate an ambiguous quote',()=>{
  const r=validateMemoryDrafts({memories:[draft()]},{id:'c',content:'用户：我完成了一次产品访谈。\nAI：我完成了一次产品访谈。'});
  assert.equal(r.accepted.length,0);
});
test('valid calendar dates invented by a model do not become event dates',()=>{
  const r=validateMemoryDrafts({memories:[draft({occurredAt:'2040-01-02',occurredPrecision:'day'})]},{id:'c',content:'用户：我完成了一次产品访谈。'});
  assert.equal(r.accepted[0].draft.occurredAt,null);
});
test('numeric and programming punctuation carry meaning during deduplication',()=>{
  assert.notEqual(statementKey('我的绩点是3.5'),statementKey('我的绩点是35'));
  assert.notEqual(statementKey('我会C++编程'),statementKey('我会C编程'));
});
test('distinct evidence and dates survive in-batch normalization',()=>{
  const a={draft:draft({occurredAt:'2025-01',quote:'第一次访谈'}),start:0,end:5};
  const b={draft:draft({occurredAt:'2026-01',quote:'第二次访谈',detail:'不同的背景'}),start:20,end:25};
  assert.equal(mergeDrafts([a,b]).length,2);
});
test('duplicate wording never discards a stricter privacy classification',()=>{
 const a={draft:draft({sensitivity:'normal'})},b={draft:draft({sensitivity:'sensitive'})};
 assert.equal(mergeDrafts([a,b]).length,2);
});
test('many quotes from one source never count as independent corroboration',()=>{
  assert.equal(scoreConfidence({evidenceCount:3,distinctConversations:1,spanDays:200}),'low');
});
test('irrelevant recall abstains instead of disclosing arbitrary recent memories',()=>{
  const rows=[{id:'1',status:'confirmed',sensitivity:'normal',statement:'我喜欢游泳',detail:'',topicTitle:'运动',updatedAt:'2026-01-01'}];
  assert.deepEqual(recallMemories(rows,'量子纠缠原理').selected,[]);
});
test('recall mode rejects unsolicited action plans from the model',()=>{
  const result={answer:[{text:'回顾',memoryIds:['m']}],uncertainties:[],steps:[{text:'行动',check:'复盘',memoryIds:['m']}]};
  assert.throws(()=>validateRecall(result,[{id:'m'}],'recall'));
});
test('an explicitly grounded Chinese event date is preserved',()=>{
 const r=validateMemoryDrafts({memories:[draft({occurredAt:'2026-03-02'})]},{id:'c',content:'用户：2026年3月2日，我完成了一次产品访谈。'});
 assert.equal(r.accepted[0].draft.occurredAt,'2026-03-02');
});
test('oversized streamed provider output is cancelled before full allocation',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(32));},cancel(){cancelled=true;}});
 await assert.rejects(upstreamJson(new Response(stream),64),/large/);
 assert.equal(cancelled,true);
});
test('bounded provider JSON preserves multibyte data and rejects invalid encoding',async()=>{
 assert.deepEqual(await upstreamJson(Response.json({text:'记忆'})),{text:'记忆'});
 await assert.rejects(upstreamJson(new Response(new Uint8Array([0xff,0xfe]))));
});
