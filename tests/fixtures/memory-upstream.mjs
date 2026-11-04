const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
  if(!String(input).startsWith('https://open.bigmodel.cn/api/paas/v4/'))return originalFetch(input,options);
  const key=options.headers?.Authorization;
  if(!key?.startsWith('Bearer test-'))throw new Error('Only simulated test keys are accepted');
  if(String(input).endsWith('/models'))return Response.json({data:[{id:'glm-5.3-flash'}]});
  const payload=JSON.parse(options.body),data=JSON.parse(payload.messages[1].content);
  if(data.conversationId){
    const user=data.segments.find(s=>s.role==='user')?.text||'';
    const base={kind:'goal',statement:'我想在杭州寻找产品实习',detail:'先通过小项目验证兴趣。',occurredAt:null,occurredPrecision:'unknown',basis:'stated',sensitivity:'normal'};
    const memories=key==='Bearer test-empty'?[]:[{...base,quote:user.slice(0,30)},{...base,statement:'我已经获得三个offer',quote:'并不存在的三份offer'},{...base,statement:'我必须立即转行',quote:data.segments.find(s=>s.role==='assistant')?.text||'不在原文'}];
    return Response.json({model:payload.model,choices:[{message:{content:JSON.stringify({memories})},finish_reason:'stop'}]});
  }
  if(key==='Bearer test-race'){process.send?.({type:'recall-waiting'});await new Promise(done=>setTimeout(done,700));}
  const memory=data.memories[0];
  const ids=key==='Bearer test-badrefs'?['not-a-memory']:[memory.id];
  const result={answer:[{text:`你曾表达：${memory.statement}。这是已确认记录，仍需结合当前情况判断。`,memoryIds:ids}],uncertainties:['还需要确认当前时间安排。'],steps:data.mode==='plan'?[{text:'用一周完成一次小型需求访谈。',check:'记录访谈感受，再判断是否继续探索。',memoryIds:ids}]:[]};
  process.send?.({type:'recall-context',ids:data.memories.map(m=>m.id)});
  return Response.json({model:payload.model,choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}]});
};
