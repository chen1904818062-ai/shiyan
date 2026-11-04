"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle, ArrowUpRight, Brain, Check, ChevronDown, LoaderCircle, Pencil,
  Quote, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Trash2, X, XCircle,
} from "lucide-react";
import {
  axisMeta, basisLabel, confidenceLabel, kindLabel, kindMeta, memoryKinds, statusLabel,
  type MemoryAxis,
} from "@/lib/memory/taxonomy";
import type { MemoryEvidenceRecord, MemoryRecord, MemoryStats } from "@/lib/memory/types";
import type { Conversation, Topic } from "@/lib/types";
import MemoryAgent from "./memory-agent";
import { sensitivityLabels, sensitivityLevels, type SensitivityLevel } from "@/lib/memory/taxonomy";

type Props = {
  notify: (message: string) => void;
  onGoTopics: () => void;
  onOpenSettings: () => void;
  canExtract: boolean;
  modelPayload: Record<string, string>;
};

type ExtractResult = { processed: number; created: number; merged: number; remaining: number; rejected: string; skipped: string[] };

const axisOrder: MemoryAxis[] = ["fact", "value", "judgment", "intent", "reference"];

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers }, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || "连接暂时失败，请稍后再试。");
  return data;
}

function timeText(memory: MemoryRecord) {
  const value = memory.occurredAt;
  if (!value) return "时间未记录";
  if (value.length === 4) return `${value} 年`;
  if (value.length === 7) return `${value.slice(0, 4)} 年 ${Number(value.slice(5, 7))} 月`;
  return `${value.slice(0, 4)} 年 ${Number(value.slice(5, 7))} 月 ${Number(value.slice(8, 10))} 日`;
}

function roleText(role: string) {
  if (role === "user") return "你说";
  if (role === "assistant") return "AI 说";
  return "说话人未标注";
}

function highlightParts(content: string, evidence: MemoryEvidenceRecord) {
  const quote = evidence.quote.replace(/\s+/g, "");
  let start = evidence.charStart;
  let end = evidence.charEnd;
  const valid = start !== null && end !== null && start >= 0 && end <= content.length && start < end
    && content.slice(start, end).replace(/\s+/g, "") === quote;
  if (!valid) {
    const index = content.indexOf(evidence.quote);
    if (index >= 0) { start = index; end = index + evidence.quote.length; }
    else { start = null; end = null; }
  }
  if (start === null || end === null) return [content, "", ""] as const;
  return [content.slice(0, start), content.slice(start, end), content.slice(end)] as const;
}

function Dialog({ title, subtitle, onClose, wide, children }: { title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={headingId} className={`modal ${wide ? "wide" : ""}`} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="modal-heading"><div><h2 id={headingId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}

export default function MemoryLibrary({ notify, onGoTopics, onOpenSettings, canExtract, modelPayload }: Props) {
  const [memories, setMemories] = useState<MemoryRecord[] | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [axis, setAxis] = useState<"all" | MemoryAxis>("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [revise, setRevise] = useState<MemoryRecord | null>(null);
  const [reviseForm, setReviseForm] = useState({ statement: "", detail: "", kind: "event", sensitivity: "normal" as SensitivityLevel });
  const [mode,setMode] = useState<"archive"|"recall"|"plan">("archive");
  const [manual,setManual] = useState(false);
  const [manualForm,setManualForm] = useState({statement:"",detail:"",kind:"event",sensitivity:"normal"});
  const [history,setHistory] = useState<{id:string;beforeJson:string;afterJson:string;reason:string;createdAt:string}[]|null>(null);
  const [hasMore,setHasMore] = useState(false);
  const [order,setOrder] = useState("recorded");
  const [pendingDelete, setPendingDelete] = useState<MemoryRecord | null>(null);
  const [source, setSource] = useState<{ evidence: MemoryEvidenceRecord; conversation: Conversation | null; loading: boolean } | null>(null);
  const [extractOpen, setExtractOpen] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ memories: MemoryRecord[]; stats: MemoryStats }>("/api/memories?limit=300");
    setHasMore(data.stats.total>data.memories.length);
    setMemories(data.memories);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    let live = true;
    // 异步加载：状态更新发生在请求回调中，不在 effect 同步阶段。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e: Error) => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [load]);

  const axisCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const memory of memories || []) {
      const key = kindMeta(memory.kind).axis;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [memories]);

  const visible = useMemo(() => (memories || []).filter(memory => {
    if (axis !== "all" && kindMeta(memory.kind).axis !== axis) return false;
    if (status !== "all" && memory.status !== status) return false;
    const keyword = query.trim().toLowerCase();
    if (keyword && !`${memory.statement}${memory.detail}${memory.topicTitle}`.toLowerCase().includes(keyword)) return false;
    return true;
  }).sort((a,b)=> order === "occurred" ? (b.occurredAt||"").localeCompare(a.occurredAt||"") : b.updatedAt.localeCompare(a.updatedAt)), [memories, axis, status, query, order]);

  async function more() {
    setBusy("more");try{const data=await api<{memories:MemoryRecord[];stats:MemoryStats}>(`/api/memories?limit=300&offset=${memories?.length||0}`);setMemories(old=>[...(old||[]),...data.memories]);setHasMore((memories?.length||0)+data.memories.length<data.stats.total);}catch(e){setError((e as Error).message);}finally{setBusy("");}
  }
  async function saveManual(){
    if(busy)return;setBusy("manual");setError("");
    try{await api("/api/memories",{method:"POST",body:JSON.stringify(manualForm)});setManual(false);setManualForm({statement:"",detail:"",kind:"event",sensitivity:"normal"});await load();notify("记忆已保存，请核对后确认。");}catch(e){setError((e as Error).message);}finally{setBusy("");}
  }
  async function openHistory(memory:MemoryRecord){
    setBusy(memory.id);try{const data=await api<{revisions:NonNullable<typeof history>}>(`/api/memories/${memory.id}`);setHistory(data.revisions);}catch(e){setError((e as Error).message);}finally{setBusy("");}
  }
  async function exportMemories(){
    setBusy("export");try{let offset=0;const all:MemoryRecord[]=[];while(true){const data=await api<{memories:MemoryRecord[]}>(`/api/memories?limit=500&offset=${offset}`);all.push(...data.memories);if(data.memories.length<500)break;offset+=500;}const link=document.createElement("a"),url=URL.createObjectURL(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),memories:all},null,2)],{type:"application/json"}));link.href=url;link.download="拾言-个人记忆.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError((e as Error).message);}finally{setBusy("");}
  }

  async function patch(memory: MemoryRecord, payload: Record<string, unknown>, message: string) {
    setBusy(memory.id);
    try {
      const data = await api<{ memory: MemoryRecord }>(`/api/memories/${memory.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setMemories(old => old ? old.map(item => item.id === memory.id ? data.memory : item) : old);
      notify(message);
      load().catch(() => undefined);
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(""); }
  }

  async function remove(memory: MemoryRecord) {
    setBusy(memory.id);
    try {
      await api(`/api/memories/${memory.id}`, { method: "DELETE" });
      setMemories(old => old ? old.filter(item => item.id !== memory.id) : old);
      setPendingDelete(null);
      notify("这条记忆已删除，原文不受影响。");
      load().catch(() => undefined);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }

  async function openEvidence(evidence: MemoryEvidenceRecord) {
    setSource({ evidence, conversation: null, loading: true });
    try {
      const data = await api<{ conversation: Conversation }>(`/api/conversations/${evidence.conversationId}`);
      setSource(current => current && current.evidence.id === evidence.id ? { ...current, conversation: data.conversation, loading: false } : current);
    } catch {
      setSource(current => current ? { ...current, loading: false } : current);
    }
  }

  async function openExtract() {
    if (!canExtract) { onOpenSettings(); return; }
    setExtractOpen(true);
    setExtractResult(null);
    setError("");
    if (!topics.length) {
      try {
        const data = await api<{ topics: Topic[] }>("/api/topics");
        setTopics(data.topics);
        setTopicId(data.topics[0]?.id || "");
      } catch (e) { setError((e as Error).message); }
    }
  }

  async function runExtract() {
    if (!topicId || extracting) return;
    setExtracting(true);
    setError("");
    try {
      const result = await api<ExtractResult>("/api/memories/extract", { method: "POST", body: JSON.stringify({ topicId, ...modelPayload }) });
      setExtractResult(result);
      await load();
      notify(`新增 ${result.created} 条记忆${result.merged ? `，合并 ${result.merged} 条` : ""}。`);
    } catch (e) { setError((e as Error).message); }
    finally { setExtracting(false); }
  }

  function startRevise(memory: MemoryRecord) {
    setRevise(memory);
    setReviseForm({ statement: memory.statement, detail: memory.detail, kind: memory.kind, sensitivity: memory.sensitivity });
  }

  async function submitRevise() {
    if (!revise || reviseForm.statement.trim().length < 4) return;
    const saved = await patch(revise, { action: "revise", ...reviseForm }, "已修订。请重新确认后再用于回答，并已保留修改前的版本。");
    if(saved)setRevise(null);
  }

  return <section className="memory-library">
    <div className="memory-mode-tabs" role="group" aria-label="记忆功能">{([['archive','记忆档案'],['recall','与记忆对话'],['plan','规划与复盘']] as const).map(([id,label])=><button key={id} className={mode===id?'active':''} disabled={!!busy||extracting} onClick={()=>{setMode(id);setError("");if(id==='archive')load().catch(()=>undefined);}}>{label}</button>)}</div>
    {mode!=="archive"?<MemoryAgent key={mode} mode={mode} canExtract={canExtract} modelPayload={modelPayload} onOpenSettings={onOpenSettings} notify={notify}/>:<>
    <div className="memory-notice">
      <ShieldCheck size={15} />
      <span>记忆保留原句与说话人，提炼结果先作为候选，由你核对确认。确认表示你认可这条记录，不代表其中的外部观点已被客观核实。</span>
    </div>

    {error && <div className="memory-error" role="alert"><AlertCircle size={15} /><span>{error}</span><button className="text-button" onClick={() => { setError(""); load().catch(() => undefined); }}>重试</button></div>}

    <div className="memory-stats">
      <div className="memory-stat"><span>全部记忆</span><strong>{stats?.total ?? 0}</strong><small>条可回溯的记录</small></div>
      <div className="memory-stat"><span>待确认</span><strong>{stats?.candidate ?? 0}</strong><small>需要你判断是否成立</small></div>
      <div className="memory-stat"><span>已确认</span><strong>{stats?.confirmed ?? 0}</strong><small>可以进入规划</small></div>
      <div className="memory-stat"><span>覆盖话题</span><strong>{stats?.topics ?? 0}</strong><small>个来源话题</small></div>
    </div>

    <div className="memory-toolbar">
      <div className="memory-filters" role="group" aria-label="按类型筛选">
        <button className={`memory-chip ${axis === "all" ? "active" : ""}`} onClick={() => setAxis("all")}>全部 <small>{memories?.length ?? 0}</small></button>
        {axisOrder.map(item => <button key={item} className={`memory-chip ${axis === item ? "active" : ""}`} onClick={() => setAxis(item)} title={axisMeta[item].hint}>{axisMeta[item].label} <small>{axisCounts[item] || 0}</small></button>)}
      </div>
      <div className="memory-toolbar-right">
        <button className="text-button" onClick={exportMemories} disabled={!!busy}>导出记忆</button>
        <button className="button secondary" onClick={()=>{setError("");setManual(true);}}>补充记忆</button>
        <label className="memory-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索记忆…" aria-label="搜索记忆" /></label>
        <select className="memory-select" value={status} onChange={event => setStatus(event.target.value)} aria-label="按状态筛选">
          <option value="all">全部状态</option>
          <option value="candidate">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="revised">已修订</option>
          <option value="retracted">已推翻</option>
          <option value="expired">已过期</option>
        </select>
        <select aria-label="记忆排序" className="memory-select" value={order} onChange={e=>setOrder(e.target.value)}><option value="recorded">最近更新</option><option value="occurred">经历时间线</option></select>
        <button className="button primary" onClick={openExtract}><Sparkles size={15} />提炼记忆</button>
      </div>
    </div>

    {loading ? <div className="loading-state"><LoaderCircle className="spin" />正在打开记忆库…</div>
      : !memories?.length ? <div className="memory-empty">
        <span className="outline-icon"><Brain size={22} /></span>
        <h3>记忆库还是空的</h3>
        <p>记忆不是摘要。它把对话里关于你的事实、能力、判断和目标拆成一条条可回看的记录，再逐步长成你的职业与人生档案。</p>
        <div className="memory-empty-steps"><span>01 在话题里粘贴对话</span><span>02 提炼为记忆</span><span>03 确认或推翻</span></div>
        <div className="modal-footer" style={{ border: 0, margin: 0, padding: 0 }}>
          <button className="button secondary" onClick={onGoTopics}>去我的话题</button>
          <button className="button primary" onClick={openExtract}><Sparkles size={15} />提炼记忆</button>
        </div>
      </div>
      : visible.length ? <div className="memory-grid">
        {visible.map(memory => {
          const meta = kindMeta(memory.kind);
          const open = expanded === memory.id;
          const working = busy === memory.id;
          return <article className="memory-card" key={memory.id}>
            <div className="memory-card-head">
              <span className={`memory-kind axis-${meta.axis}`}>{kindLabel(memory.kind)}</span>
              <span className="memory-time">{timeText(memory)}</span>
              <span className={`memory-status ${memory.status}`}>{statusLabel(memory.status)}</span>
            </div>
            <h3>{memory.statement}</h3>
            {memory.detail && <p className="memory-detail">{memory.detail}</p>}
            <div className="memory-meta">
              <span>{sensitivityLabels[memory.sensitivity]}</span>
              <span className={`confidence ${memory.confidence}`}><i />{confidenceLabel(memory.confidence)}</span>
              <span>{basisLabel(memory.basis)}</span>
              {memory.sourceRole === "unknown" && <span className="memory-warn">说话人未标注</span>}
              <span className="memory-topic">{memory.topicTitle}</span>
            </div>
            <button className="memory-evidence-toggle" onClick={() => setExpanded(open ? null : memory.id)} aria-expanded={open}>
              <Quote size={12} />{memory.evidence.length} 条证据<ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : undefined }} />
            </button>
            {open && <div className="memory-evidence-list">
              {memory.evidence.map(evidence => <button className="memory-evidence" key={evidence.id} onClick={() => openEvidence(evidence)}>
                <span className="memory-quote">“{evidence.quote}”</span>
                <span className="memory-source">{evidence.conversationTitle} · {roleText(evidence.speakerRole)}<ArrowUpRight size={10} /></span>
              </button>)}
            </div>}
            <div className="memory-actions">
              {memory.status !== "confirmed" && <button disabled={working} onClick={() => patch(memory, { action: "confirm" }, "已确认。这条记忆可以进入后续的规划。")}><Check size={12} />确认</button>}
              <button disabled={working} onClick={() => startRevise(memory)}><Pencil size={12} />修订</button>
              {memory.status !== "retracted" && <button disabled={working} onClick={() => patch(memory, { action: "retract", reason: "用户标记为不准确" }, "已标记为不准确，原判断会保留在修订史里。")}><XCircle size={12} />不准确</button>}
              {memory.status !== "expired" && <button disabled={working} onClick={()=>patch(memory,{action:"expire",reason:"用户标记为不再适用"},"已归档为不再适用，不会用于记忆回答。")}>不再适用</button>}
              <button disabled={working} onClick={()=>openHistory(memory)}>修订历史</button>
              <button className="danger" disabled={working} onClick={() => setPendingDelete(memory)}><Trash2 size={12} />删除</button>
              {working && <LoaderCircle size={12} className="spin" />}
            </div>
          </article>;
        })}
      </div>
        : <div className="memory-empty"><h3>没有符合条件的记忆</h3><p>换一个关键词或筛选条件，或者继续从对话里提炼。</p><button className="button secondary" onClick={() => { setAxis("all"); setStatus("all"); setQuery(""); }}><RefreshCw size={14} />清除筛选</button></div>}

    {hasMore&&<button className="button secondary" onClick={more} disabled={!!busy}>加载更多记忆（当前筛选基于已加载内容）</button>}
    {manual&&<Dialog title="补充一条个人记忆" subtitle="写下真实经历或当前想法，保存后核对确认。原文会保存在「个人记忆补充」话题。" onClose={()=>{if(!busy)setManual(false);}}>
      <label className="memory-field">类型<select aria-label="类型" value={manualForm.kind} onChange={e=>setManualForm({...manualForm,kind:e.target.value})}>{memoryKinds.map(k=><option key={k} value={k}>{kindLabel(k)}</option>)}</select></label>
      <label className="memory-field">记忆内容<textarea maxLength={200} value={manualForm.statement} onChange={e=>setManualForm({...manualForm,statement:e.target.value})}/></label>
      <label className="memory-field">补充背景<textarea maxLength={600} value={manualForm.detail} onChange={e=>setManualForm({...manualForm,detail:e.target.value})}/></label>
      <label className="memory-field">使用范围<select value={manualForm.sensitivity} onChange={e=>setManualForm({...manualForm,sensitivity:e.target.value})}>{sensitivityLevels.map(s=><option key={s} value={s}>{sensitivityLabels[s]}</option>)}</select></label>
      <p className="memory-hint">普通记忆确认后可用于回答；私密和敏感记忆需要每次额外允许。</p>
      {error&&<p role="alert" className="memory-error">{error}</p>}
      <div className="modal-footer"><button className="button secondary" onClick={()=>setManual(false)} disabled={!!busy}>取消</button><button className="button primary" onClick={saveManual} disabled={!!busy||manualForm.statement.trim().length<4}>保存为待确认记忆</button></div>
    </Dialog>}
    {history&&<Dialog title="记忆修订历史" subtitle="保存最近100次修改。原句属于当时记录，修订代表你的后续更正。" onClose={()=>setHistory(null)}>{history.length?history.map(r=><article className="memory-used-source" key={r.id}><small>{new Date(r.createdAt).toLocaleString("zh-CN")}</small><p>修改前：{JSON.parse(r.beforeJson).statement} · {statusLabel(JSON.parse(r.beforeJson).status)}</p><p>修改后：{JSON.parse(r.afterJson).statement} · {statusLabel(JSON.parse(r.afterJson).status)}</p><p>补充：{JSON.parse(r.afterJson).detail||"无"}</p><p>{r.reason}</p></article>):<p>还没有修订记录。</p>}</Dialog>}
    {extractOpen && <Dialog title="从对话里提炼记忆" subtitle="每次处理 1 段尚未提炼的对话，可继续提炼剩余资料。" onClose={() => { if (!extracting) setExtractOpen(false); }}>
      {!topics.length ? <p className="memory-hint">还没有话题。先在「我的话题」里添加对话，再回来提炼。</p>
        : <>
          <label className="memory-field">选择话题
            <select value={topicId} onChange={event => setTopicId(event.target.value)} disabled={extracting}>
              {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}（{topic.count} 段对话）</option>)}
            </select>
          </label>
          <p className="memory-dialog-note">只抽取你亲口说过的内容。引文在原文里找不到的条目会被直接丢弃；AI 的说法只能记为「参考观点」。</p>
          {extractResult && <div className="memory-extract-result">
            <span>本次处理 {extractResult.processed} 段</span>
            <span>新增 {extractResult.created} 条</span>
            {extractResult.merged > 0 && <span>合并 {extractResult.merged} 条</span>}
            {extractResult.rejected && <span>丢弃：{extractResult.rejected}</span>}
            {extractResult.remaining > 0 && <span>还有 {extractResult.remaining} 段待提炼</span>}
            {!!extractResult.skipped.length&&<span>内容过长已跳过：{extractResult.skipped.join("、")}</span>}
          </div>}
          {error&&<p className="memory-error" role="alert">{error}</p>}
          <div className="modal-footer">
            {!canExtract && <span className="save-note"><Settings2 size={13} />需要先配置模型</span>}
            <button className="button secondary" onClick={() => setExtractOpen(false)} disabled={extracting}>关闭</button>
            <button className="button primary" onClick={runExtract} disabled={extracting || !topicId}>
              {extracting ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{extracting ? "正在提炼…" : "开始提炼"}
            </button>
          </div>
        </>}
    </Dialog>}

    {revise && <Dialog title="修订这条记忆" subtitle="修订不会删除原判断，修改前后都会留档。" onClose={() => setRevise(null)}>
      <label className="memory-field">使用范围<select value={reviseForm.sensitivity} onChange={e=>setReviseForm({...reviseForm,sensitivity:e.target.value as SensitivityLevel})}>{sensitivityLevels.map(s=><option key={s} value={s}>{sensitivityLabels[s]}</option>)}</select></label>
      <label className="memory-field">记忆类型
        <select value={reviseForm.kind} onChange={event => setReviseForm({ ...reviseForm, kind: event.target.value })}>
          {memoryKinds.map(kind => <option key={kind} value={kind}>{kindLabel(kind)} · {kindMeta(kind).hint}</option>)}
        </select>
      </label>
      <label className="memory-field">陈述
        <textarea aria-label="陈述" value={reviseForm.statement} maxLength={200} onChange={event => setReviseForm({ ...reviseForm, statement: event.target.value })} />
        <span className="memory-hint">用第一人称写一件事，不要把多个事实塞进一句。</span>
      </label>
      <label className="memory-field">补充说明
        <textarea value={reviseForm.detail} maxLength={600} onChange={event => setReviseForm({ ...reviseForm, detail: event.target.value })} />
      </label>
      <div className="modal-footer">
        <button className="button secondary" onClick={() => setRevise(null)}>取消</button>
        <button className="button primary" onClick={submitRevise} disabled={reviseForm.statement.trim().length < 4 || busy === revise.id}><Check size={15} />保存修订</button>
      </div>
      {error&&<p className="memory-error" role="alert">{error}</p>}
    </Dialog>}

    {pendingDelete && <Dialog title="删除这条记忆？" onClose={() => setPendingDelete(null)}>
      <p className="delete-description">「{pendingDelete.statement}」及其证据会一并删除，原始对话不受影响。此操作无法撤销。</p>
      <div className="modal-footer">
        <button className="button secondary" onClick={() => setPendingDelete(null)}>保留</button>
        <button className="button destructive" onClick={() => remove(pendingDelete)} disabled={busy === pendingDelete.id}><Trash2 size={15} />确认删除</button>
      </div>
    </Dialog>}

    {source && <Dialog title={source.evidence.conversationTitle} subtitle="完整原文 · 高亮处是这条记忆的来源" onClose={() => setSource(null)} wide>
      {source.loading ? <div className="loading-state"><LoaderCircle className="spin" />正在打开原文…</div>
        : source.conversation ? <>
          <div className="source-view-meta"><span>{source.conversation.source}</span><span>{roleText(source.evidence.speakerRole)}</span><span>对话日期：{source.conversation.conversationDate || "未提供"}</span></div>
          <pre className="memory-source-view">{(() => { const [before, hit, after] = highlightParts(source.conversation.content, source.evidence); return <>{before}{hit ? <mark>{hit}</mark> : null}{after}</>; })()}</pre>
          <div className="modal-footer"><button className="button primary" onClick={() => setSource(null)}>返回记忆库</button></div>
        </> : <p className="memory-hint">原文暂时无法打开，可能已被删除。</p>}
    </Dialog>}
    </>}
  </section>;
}
