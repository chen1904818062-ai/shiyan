"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send, Download } from "lucide-react";
import type { RecallResponse } from "@/lib/memory/recall";
import type { MemoryRecord } from "@/lib/memory/types";
import type { ModelInfo } from "@/lib/types";
import { modelIdentityText } from "@/lib/model-response";
import { kindLabel } from "@/lib/memory/taxonomy";

type Answer = { result: RecallResponse; memories: MemoryRecord[]; matched: boolean; eligible: number; modelInfo: ModelInfo };
export default function MemoryAgent({ mode, canExtract, modelPayload, onOpenSettings, notify }: {mode:"recall"|"plan";canExtract:boolean;modelPayload:Record<string,string>;onOpenSettings:()=>void;notify:(text:string)=>void}) {
  const [question,setQuestion] = useState("");
  const [answeredQuestion,setAnsweredQuestion] = useState("");
  const [includePrivate,setIncludePrivate] = useState(false);
  const [answer,setAnswer] = useState<Answer|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [feedback,setFeedback] = useState("");
  const [saving,setSaving] = useState(false);
  const [original,setOriginal] = useState("");
  const [sourceError,setSourceError] = useState("");
  const lock = useRef(false); const controller = useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function ask(event: React.FormEvent) {
    event.preventDefault(); if(lock.current)return;
    if(!canExtract){onOpenSettings();return;}
    const permitted = includePrivate;
    lock.current=true;setBusy(true);setError("");setAnswer(null);setOriginal("");setFeedback("");setIncludePrivate(false);
    const abort=new AbortController();controller.current=abort;
    const timeout=setTimeout(()=>abort.abort(),165_000);
    try {
      const response=await fetch("/api/memories/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,mode,includePrivate:permitted,...modelPayload}),signal:abort.signal});
      const data=await response.json() as Answer & {error?:string}; if(!response.ok)throw new Error(data.error||"暂时无法回答。"); setAnswer(data);setAnsweredQuestion(question);
    }catch(e){setError(abort.signal.aborted?"等待较久，请稍后重试。":(e as Error).message);}
    finally{clearTimeout(timeout);setBusy(false);lock.current=false;}
  }
  async function saveFeedback(){
    if(saving||feedback.trim().length<4)return;setSaving(true);setError("");
    try{
      const response=await fetch("/api/memories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({statement:feedback.trim(),detail:"用户在规划复盘中主动记录。",kind:"lesson",sensitivity:"private"})});
      const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||"保存失败。");
      setFeedback("");notify("复盘已存为私密候选记忆，请到记忆档案确认后再用于规划。");
    }catch(e){setError((e as Error).message);}finally{setSaving(false);}
  }
  async function openSource(id:string){
    setSourceError("");setOriginal("");
    try{const r=await fetch(`/api/conversations/${id}`,{cache:"no-store"});const d=await r.json() as {error?:string;conversation:{content:string}};if(!r.ok)throw new Error(d.error);setOriginal(d.conversation.content);}catch{setSourceError("原文暂时无法打开，可能已被删除。");}
  }
  function download(){
    if(!answer)return;
    const text=[`# ${mode==="plan"?"基于记忆的规划":"与记忆对话"}`,answeredQuestion,...answer.result.answer.map(p=>`${p.text}\n依据：${p.memoryIds.join("、")}`),"## 待确认",...answer.result.uncertainties,"## 建议行动",...answer.result.steps.map(p=>`${p.text}\n复盘：${p.check}\n依据：${p.memoryIds.join("、")}`),"## 使用的记忆",...answer.memories.map(m=>`${m.id}：${m.statement}\n${m.evidence.map(e=>`原句：${e.quote}`).join("\n")}`)].join("\n\n");
    const url=URL.createObjectURL(new Blob([text],{type:"text/markdown;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="拾言-记忆回答.md";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const citation=(ids:string[])=> <span className="memory-citations">{ids.map(id=><a key={id} href={`#memory-source-${id}`} onClick={()=>{const details=document.getElementById(`memory-source-${id}`)?.closest("details");if(details)details.open=true;}}>记忆 {answer!.memories.findIndex(m=>m.id===id)+1}</a>)}</span>;
  return <div className="memory-agent">
    <div className="memory-notice">{mode==="plan"?"从已确认记忆出发，探索职业、学习和阶段目标。计划是建议，复盘由你记录。":"找回经历、理解决定、观察变化。回答只依据本次检索到的记忆。"}</div>
    <div className="memory-prompts">{(mode==="plan"?["结合我的经历，接下来四周如何探索职业方向？","围绕我的学习目标，制定一个可复盘的计划。"]:["我之前为什么做出这个求职决定？","我有哪些经历可以支持面试中的能力描述？"]).map(text=><button key={text} className="memory-chip" disabled={busy} onClick={()=>setQuestion(text)}>{text}</button>)}</div>
    <form onSubmit={ask}>
      <label className="memory-field">{mode==="plan"?"你的目标与现实限制":"想从记忆中了解什么？"}<textarea value={question} onChange={e=>setQuestion(e.target.value)} minLength={2} maxLength={2000} required disabled={busy} placeholder="例如：我目前有哪些项目经历，下一步还需要验证什么？" /></label>
      <label className="memory-permission"><input type="checkbox" checked={includePrivate} onChange={e=>{setIncludePrivate(e.target.checked);setAnswer(null);}} disabled={busy}/>允许本次使用私密和敏感记忆</label>
      <p className="memory-hint">在全部已确认且获准使用的记忆中按关键词检索，最多发送24条及证据到所选模型。找不到相关记忆时不会调用模型。私密授权仅对本次提交有效；关键词检索可能遗漏同义表达。回答暂存在当前页面，可提前导出。</p>
      <button className="button primary" type="submit" disabled={busy||question.trim().length<2}>{busy?<LoaderCircle className="spin" size={15}/>:<Send size={15}/>} {busy?"正在调用记忆…":!canExtract?"配置模型后继续":mode==="plan"?"生成探索计划":"查找记忆并回答"}</button>
    </form>
    {error&&<p className="memory-error" role="alert">{error}</p>}
    {answer&&<section className="memory-answer" aria-live="polite"><div className="memory-answer-heading"><h2>{mode==="plan"?"我的探索计划":"来自记忆的回答"}</h2><button className="text-button" onClick={download}><Download size={14}/>导出</button></div>
      <p className="memory-hint">本次使用 {answer.memories.length} / {answer.eligible} 条可用记忆。{answer.matched?"按关键词匹配。":"没有关键词匹配，使用近期记忆，可能不足以回答。"}</p>
      {answer.result.answer.map((p,i)=><p className="memory-answer-point" key={i}>{p.text}{citation(p.memoryIds)}</p>)}
      {!!answer.result.uncertainties.length&&<><h3>还需要确认</h3><ul>{answer.result.uncertainties.map((text,i)=><li key={i}>{text}</li>)}</ul></>}
      {!!answer.result.steps.length&&<><h3>建议行动与复盘</h3><ol>{answer.result.steps.map((p,i)=><li key={i}><p>{p.text}{citation(p.memoryIds)}</p><small>复盘方式：{p.check}</small></li>)}</ol></>}
      <details><summary>查看本次依据与原文</summary>{answer.memories.map((m,i)=><article className="memory-used-source" id={`memory-source-${m.id}`} key={m.id}><h4>记忆 {i+1} · {kindLabel(m.kind)} · {m.statement}</h4><p>{m.detail}</p><small>发生时间：{m.occurredAt||"未记录"} · {m.basis==="inferred"?"含推断，已由用户确认":"已由用户确认"}</small>{m.evidence.map(e=><blockquote key={e.id}>{e.quote}<button className="text-button" onClick={()=>openSource(e.conversationId)}>查看完整原文</button></blockquote>)}</article>)}</details>
      {sourceError&&<p role="alert">{sourceError}</p>}{original&&<div><button className="text-button" onClick={()=>setOriginal("")}>收起原文</button><pre className="memory-source-view">{original}</pre></div>}
      <p className="memory-hint">{modelIdentityText(answer.modelInfo,answer.modelInfo.requestedModel)}</p>
      {mode==="plan"&&<div className="memory-review"><h3>记录行动反馈</h3><label className="memory-field">实际做了什么、发现了什么？<textarea maxLength={200} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="请写实际经历或认识，不要把计划当成已经完成。"/></label><button className="button secondary" onClick={saveFeedback} disabled={saving||feedback.trim().length<4}>{saving?"正在保存…":"存入记忆，待我确认"}</button></div>}
    </section>}
  </div>;
}
