const $ = id => document.getElementById(id);
const kinds={event:'经历',achievement:'成果',role:'角色',relationship:'关系',constraint:'约束',preference:'偏好',value:'价值',aversion:'排斥',decision:'决策',belief:'信念',lesson:'教训',goal:'目标',wish:'念头',reference:'参考'};
const statuses={candidate:'待确认',confirmed:'已确认',revised:'已修订',retracted:'已推翻',expired:'已过期'};
const colors=['#789565','#b08c68','#729894','#9b83a1','#ac9b58','#7894ad'];
let memories=[],view='graph';
const text=(tag,value,parent,className)=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;if(parent)parent.append(el);return el;};
const clean=(value,max)=>typeof value==='string'?value.slice(0,max):'';
export function parseExport(raw){
 if(!raw||raw.version!==1||!Array.isArray(raw.memories)||raw.memories.length>2000)throw Error('请选择拾言个人记忆导出文件（版本1，最多2,000条），不要导入整库备份。');
 const seen=new Set();
 let evidenceCount=0;
 return raw.memories.map(m=>{
  if(!m||typeof m.id!=='string'||m.id.length>100||seen.has(m.id)||!m.statement||typeof m.statement!=='string'||!Object.hasOwn(kinds,m.kind)||!Object.hasOwn(statuses,m.status)||!['normal','private','sensitive'].includes(m.sensitivity)||!Array.isArray(m.evidence)||m.evidence.length>2000)throw Error('文件包含不完整或重复的记忆，请重新导出。');
  seen.add(m.id);
  evidenceCount+=m.evidence.length;if(evidenceCount>20000)throw Error('证据总量超过本页20,000条上限，请缩小导出范围。');
  const occurred=typeof m.occurredAt==='string'&&/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(m.occurredAt)?m.occurredAt:null;
  return {id:m.id,statement:clean(m.statement,200),detail:clean(m.detail,600),topicId:clean(m.topicId,100),topicTitle:clean(m.topicTitle,100)||'未分类话题',kind:m.kind,status:m.status,sensitivity:m.sensitivity,occurredAt:occurred,evidence:m.evidence.map(e=>({quote:clean(e?.quote,400),conversationTitle:clean(e?.conversationTitle,120),speakerRole:['user','assistant'].includes(e?.speakerRole)?e.speakerRole:'unknown'}))};
 });
}
function resetDetail(){ $('detail').replaceChildren();text('p','一条记忆的来路',$('detail'),'eyebrow');text('h2','从地图上的一个点开始。',$('detail'));text('p','点击一个节点或时间线条目，查看背景和原句。',$('detail')); }
function showDetail(m){
 const box=$('detail');box.replaceChildren();text('p',`${kinds[m.kind]} · ${statuses[m.status]}`,box,'eyebrow');text('h2',m.statement,box);text('p',m.detail||'没有补充背景。',box);text('small',`话题：${m.topicTitle}`,box);text('small',`发生时间：${m.occurredAt||'未记录'}`,box);text('small',`可见性：${{normal:'普通',private:'私密',sensitive:'敏感'}[m.sensitivity]}`,box);
 text('h3',`原句证据 · ${m.evidence.length} 条`,box);
 for(const e of m.evidence.slice(0,30)){text('blockquote',e.quote,box);text('small',`${e.conversationTitle} · ${{user:'你说',assistant:'AI说',unknown:'说话人未标注'}[e.speakerRole]}`,box);}
 if(m.evidence.length>30)text('p','本页展示前30条证据，其余请回拾言查看。',box);
}
function svg(tag,attrs,parent){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;}
function draw(rows){
 const canvas=$('map');canvas.replaceChildren();
 if(!rows.length){svg('text',{x:500,y:330,'text-anchor':'middle',fill:'#879477','font-size':18},canvas).textContent='留下一段经历，让记忆开始连接。';return;}
 const groups=new Map();
 for(const m of rows){const key=JSON.stringify([m.topicId,m.topicTitle,m.kind]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
 const entries=[...groups.entries()];
 const topicKeys=[...new Set(rows.map(m=>JSON.stringify([m.topicId,m.topicTitle])))];
 const positions=new Map(topicKeys.map((key,i)=>{const a=i*2*Math.PI/topicKeys.length-Math.PI/2;return[key,{x:500+220*Math.cos(a),y:350+185*Math.sin(a),color:colors[i%colors.length],title:JSON.parse(key)[1]}];}));
 svg('circle',{cx:500,cy:350,r:39,fill:'#e3ecd8',stroke:'#b6c7a2'},canvas);svg('text',{x:500,y:355,'text-anchor':'middle',fill:'#3d593a','font-size':13},canvas).textContent='我的记忆';
 entries.forEach(([key,list],gi)=>{
  const [topicId,topicTitle,kind]=JSON.parse(key),topic=positions.get(JSON.stringify([topicId,topicTitle]));
  const a=gi*2*Math.PI/entries.length-Math.PI/2;
  const cx=500+300*Math.cos(a),cy=350+248*Math.sin(a);
  svg('line',{x1:topic.x,y1:topic.y,x2:cx,y2:cy,stroke:topic.color,opacity:.35},canvas);
  svg('circle',{cx,cy,r:17,fill:'#f0f4e8',stroke:topic.color},canvas);svg('text',{x:cx,y:cy+4,'text-anchor':'middle','font-size':9,fill:'#52654a'},canvas).textContent=kinds[kind];
  list.forEach((m,i)=>{
   const spread=(i-(list.length-1)/2)*Math.min(.06,Math.PI*1.7/rows.length),angle=a+spread;
   const x=500+(370+(i%3)*18)*Math.cos(angle),y=350+(285+(i%3)*12)*Math.sin(angle);
   svg('line',{x1:cx,y1:cy,x2:x,y2:y,stroke:topic.color,opacity:.27},canvas);
   const g=svg('g',{role:'button',tabindex:0,'aria-label':`${m.statement}，${statuses[m.status]}`},canvas);
   svg('circle',{cx:x,cy:y,r:m.status==='confirmed'?7:5,fill:topic.color,opacity:m.status==='retracted'||m.status==='expired' ? 0.35 : 0.9},g);
   svg('title',{},g).textContent=m.statement;
   g.addEventListener('click',()=>showDetail(m));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showDetail(m);}});
  });
 });
 for(const topic of positions.values()){
  svg('line',{x1:500,y1:350,x2:topic.x,y2:topic.y,stroke:topic.color,opacity:.35},canvas);
  svg('circle',{cx:topic.x,cy:topic.y,r:24,fill:'#fff',stroke:topic.color,'stroke-width':2},canvas);
  svg('text',{x:topic.x,y:topic.y+43,'text-anchor':'middle','font-size':12,fill:'#43593e'},canvas).textContent=topic.title.slice(0,14);
 }
}
function render(){
 const query=$('search').value.trim().toLowerCase(),status=$('status').value;
 const rows=memories.filter(m=>($('private').checked||m.sensitivity==='normal')&&(status==='all'||m.status===status)&&`${m.statement} ${m.detail} ${m.topicTitle} ${m.evidence.map(e=>e.quote).join(' ')}`.toLowerCase().includes(query));
 resetDetail();$('stats').replaceChildren();
 for(const[label,value]of[['当前筛选记忆',rows.length],['已确认',rows.filter(m=>m.status==='confirmed').length],['话题',new Set(rows.map(m=>JSON.stringify([m.topicId,m.topicTitle]))).size],['原句证据',rows.reduce((n,m)=>n+m.evidence.length,0)]]){const box=text('div','',$('stats'),'stat');text('b',value,box);text('span',label,box);}
 const shown=rows.slice(0,200);$('scope').textContent=`已导入 ${memories.length} 条 · 当前呈现 ${shown.length} / ${rows.length} 条`;
 $('graph').hidden=view!=='graph';$('timeline').hidden=view!=='timeline';$('graph-tab').setAttribute('aria-pressed',String(view==='graph'));$('timeline-tab').setAttribute('aria-pressed',String(view==='timeline'));
 draw(shown);$('timeline').replaceChildren();
 const ordered=[...shown].sort((a,b)=>(a.occurredAt||'9999').localeCompare(b.occurredAt||'9999'));
 for(const m of ordered){const box=text('div','',$('timeline'),'time-entry');text('small',m.occurredAt||'发生时间未记录',box);const b=text('button',m.statement,box);b.addEventListener('click',()=>showDetail(m));}
}
let importSequence=0;
$('file').addEventListener('change',async event=>{
 const id=++importSequence,file=event.target.files[0];if(!file)return;
 try{
  if(file.size>10*1024*1024)throw Error('文件超过10 MB，请缩小导出范围。');
  const parsed=parseExport(JSON.parse(await file.text()));if(id!==importSequence)return;
  memories=parsed;$('private').checked=false;$('message').textContent='已在本页读取文件。没有上传，也未保存到浏览器存储；刷新或清除后移除。';render();
 }catch(e){if(id===importSequence)$('message').textContent=e.message;}finally{event.target.value='';}
});
$('clear').addEventListener('click',()=>{importSequence++;memories=[];$('private').checked=false;$('search').value='';$('status').value='all';$('file').value='';$('message').textContent='本页数据已清除。你的原始导出文件未被修改。';render();});
$('demo').addEventListener('click',()=>{
 importSequence++;
 memories=parseExport({version:1,memories:Array.from({length:16},(_,i)=>({id:'demo-'+i,statement:['我组织了一次校园活动','我希望尝试产品实习','我更喜欢小组协作','我完成了第一次用户访谈'][i%4],detail:'这是虚构演示数据，用于说明归档关系，不是你的经历。',topicId:'topic-'+i%3,topicTitle:['职业探索','学习成长','生活与选择'][i%3],kind:['event','goal','preference','achievement'][i%4],status:i%5?'confirmed':'candidate',sensitivity:i===15?'private':'normal',occurredAt:i%5?`2026-${String(i%9+1).padStart(2,'0')}`:null,evidence:[{quote:'这是一段虚构的演示原句。',conversationTitle:'演示对话 '+(i+1),speakerRole:'user'}]}))});
 $('private').checked=false;$('search').value='';$('status').value='all';$('message').textContent='正在查看虚构示例。所有经历与证据均为演示，不属于任何真实用户。';render();
});
for(const id of ['search','status','private'])$(id).addEventListener('input',render);
for(const mode of ['graph','timeline'])$(mode+'-tab').addEventListener('click',()=>{view=mode;render();});
render();
