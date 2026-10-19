const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
  const url=String(input); if(!url.startsWith('https://open.bigmodel.cn/api/paas/v4/')) return originalFetch(input,options);
  const key=options.headers?.Authorization;
  if(!key?.startsWith('Bearer test-')) throw new Error('This fixture accepts test keys only');
  if(url.endsWith('/models')) {
    if(key==='Bearer test-invalid') return Response.json({error:'upstream private body must not be forwarded'},{status:401});
    if(key==='Bearer test-slow') await new Promise(resolve=>setTimeout(resolve,400));
    const ids=key==='Bearer test-single'?['glm-5.3-flash']:key==='Bearer test-slow'?['stale-model']:['glm-5.3-flash','glm-4.7'];
    return Response.json({data:ids.map(id=>({id}))});
  }
  if(!url.endsWith('/chat/completions')) throw new Error('Unexpected upstream request');
  const payload=JSON.parse(options.body); const material=JSON.parse(payload.messages[1].content);
  const id=material.conversations[0].id;
  const point=text=>({text,sourceIds:[id]});
  const summary={overview:'先核实求职经历，再按岗位要求整理简历。',highlights:[{title:'简历准备',...point('对话讨论了素材整理的方法和条件。'),details:[point('先列出两段校园活动，写清自己负责的部分。')],steps:[point('核实活动数据，再按背景、任务、行动、结果组织。'),point('把相关经历与岗位要求逐项对应。')],examples:[point('原文例子：协调3个社团完成现场签到。')],caveats:[point('缺少可核实数字时写具体产出，不编造数据。')]}],positions:[point('先核实活动记录。')],questions:[],suggestions:[],uncertainty:''};
  return Response.json({...(key==='Bearer test-unreported'?{}:{model:key==='Bearer test-mismatch'?'glm-4.7':payload.model}),choices:[{message:{content:JSON.stringify(summary)},finish_reason:'stop'}]});
};
