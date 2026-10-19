"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from "react";
import { ArrowUpRight, ArrowLeft, ArrowRight, ArrowDownToLine, Plus, Search, BookOpen, CalendarDays, Settings2, MessageSquare, Sparkles, ChevronRight, ChevronLeft, X, Check, LoaderCircle, FileText, Leaf, MoreHorizontal, Link2, Trash2, Clock3, CircleHelp, LogOut, Menu, Send, Copy, AlertCircle, GraduationCap, FolderOpen } from "lucide-react";
import type { Conversation, Topic, TopicDetail, Report, SummaryItem, Source } from "@/lib/types";
import { currentWeek, inImportWeek, chinaDate } from "@/lib/summary";
import { demo as demoData } from "@/lib/demo";
import ModelSettings from "@/components/model-settings";
import { SummaryDetails, ModelIdentity } from "@/components/summary-details";
import { highlightMarkdown } from "@/lib/report-export";
import { modelIdentityText } from "@/lib/model-response";
import { APP_VERSION } from "@/lib/version";
import { providers, type ProviderId, type ModelChoices } from "@/lib/providers";

type ModalName = "topic" | "import" | "settings" | "guide" | null;
type PendingDelete = { kind: "topic" | "conversation"; id: string; title: string } | null;
const sources: Source[] = ["ChatGPT", "豆包", "DeepSeek", "其他"];
const colors = ["sage", "blue", "clay", "gold", "lilac"];
const emptyImport = { title: "", content: "", source: "ChatGPT" as Source, conversationDate: "" };

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers }, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || "连接暂时失败，请稍后再试。");
  return data;
}
const post = (value: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(value) });
function dateLabel(value: string, time = false) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value));
}
function shiftWeek(week: string, delta: number) { return chinaDate(new Date(Date.parse(week + "T00:00:00+08:00") + delta * 7 * 86400_000)); }
function weekLabel(week: string) { const end = chinaDate(new Date(Date.parse(week + "T00:00:00+08:00") + 6 * 86400_000)); return `${week.slice(5).replace("-", ".")} — ${end.slice(5).replace("-", ".")}`; }

function Brand({ small = false }: { small?: boolean }) {
  return <div className={`brand ${small ? "small" : ""}`}><span className="brand-icon"><MessageSquare size={21} strokeWidth={1.6} /><span /></span><strong>拾言<span>SHIYAN</span></strong></div>;
}
function SourceBadge({ source }: { source: string }) {
  return <span className={`source-badge source-${source === "ChatGPT" ? "gpt" : source === "豆包" ? "doubao" : source === "DeepSeek" ? "deepseek" : "other"}`}><span>{source === "ChatGPT" ? "✳" : source === "豆包" ? "豆" : source === "DeepSeek" ? "D" : "·"}</span>{source}</span>;
}
function Modal({ title, subtitle, children, onClose, busy = false, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => { ref.current?.showModal(); const dialog = ref.current; return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? "wide" : ""}`} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby={headingId}><div className="modal-heading"><div><h2 id={headingId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭弹窗" onClick={onClose} disabled={busy}><X size={20} /></button></div>{children}</dialog>;
}

export default function Workspace({ displayName, accountEnabled = false }: { displayName: string; accountEnabled?: boolean }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [page, setPage] = useState<"topics" | "weekly">("topics");
  const [tab, setTab] = useState<"summary" | "originals" | "week">("summary");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [sourceView, setSourceView] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState<PendingDelete>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [demo, setDemo] = useState(false);
  const [week, setWeek] = useState(() => currentWeek());
  const [historyId, setHistoryId] = useState("");
  const [serverModel, setServerModel] = useState({ configured: false, model: "deepseek-flash" });
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [modelChoices, setModelChoices] = useState<ModelChoices>({});
  const activeModel = selectedProvider ? modelChoices[selectedProvider] : null;
  const canGenerate = selectedProvider ? Boolean(activeModel?.apiKey.trim() && activeModel?.model.trim()) : serverModel.configured;
  const [topicForm, setTopicForm] = useState({ title: "", description: "", color: "sage" });
  const [importForm, setImportForm] = useState(emptyImport);
  const [formError, setFormError] = useState("");
  const [originalSearch, setOriginalSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("全部");
  const activeRef = useRef<string | null>(null);
  activeRef.current = selected;

  const refreshTopics = useCallback(async () => { const data = await api<{ topics: Topic[] }>("/api/topics"); setTopics(data.topics); }, []);
  const reloadDetail = useCallback(async (id: string) => { const data = await api<TopicDetail>(`/api/topics/${id}`); if (activeRef.current === id) setDetail(data); return data; }, []);
  useEffect(() => {
    let live = true;
    Promise.all([api<{ topics: Topic[] }>("/api/topics"), api<typeof serverModel>("/api/model")]).then(([data, model]) => { if (live) { setTopics(data.topics); setServerModel(model); } }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!selected) return;
    if (demo && selected === "demo") { setDetail(demoData); setDetailLoading(false); return; }
    const controller = new AbortController();
    setDetail(null); setDetailLoading(true); setError("");
    api<TopicDetail>(`/api/topics/${selected}`, { signal: controller.signal }).then(data => setDetail(data)).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected, demo]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 4500); return () => clearTimeout(id); }, [toast]);

  function home(next: "topics" | "weekly" = "topics") { if (generating) return; setSelected(null); setDetail(null); setPage(next); setDemo(false); setError(""); setMobileNav(false); setSearch(""); }
  function openTopic(id: string, nextTab: typeof tab = "summary") { if (generating) return; setDemo(false); setSelected(id); setTab(nextTab); setHistoryId(""); setOriginalSearch(""); setSourceFilter("全部"); setMobileNav(false); }
  function showDemo() { setDemo(true); setSelected("demo"); setDetail(demoData); setTab("summary"); setHistoryId(""); setMobileNav(false); }
  function showModal(name: ModalName) { setFormError(""); setModal(name); }

  async function createTopic(e: FormEvent) {
    e.preventDefault(); setSaving(true); setFormError("");
    try {
      const { topic } = await api<{ topic: Topic }>("/api/topics", post(topicForm));
      setTopics(old => [topic, ...old]); setTopicForm({ title: "", description: "", color: "sage" }); setModal(null); openTopic(topic.id); setToast("话题已创建，现在可以添加第一段对话。");
    } catch (e) { setFormError((e as Error).message); } finally { setSaving(false); }
  }

  async function saveConversation(e: FormEvent) {
    e.preventDefault(); if (!selected || demo) return; setSaving(true); setFormError("");
    try {
      await api(`/api/topics/${selected}/conversations`, post({ ...importForm, conversationDate: importForm.conversationDate || null }));
      setImportForm(emptyImport); setModal(null); setToast("对话已保存。可以继续添加，或生成话题总结。"); setHistoryId("");
      await Promise.all([reloadDetail(selected), refreshTopics()]);
    } catch (e) { setFormError((e as Error).message); } finally { setSaving(false); }
  }

  async function generate(kind: "topic" | "week") {
    if (!selected || !detail || demo || generating) return;
    if (!canGenerate) { showModal("settings"); return; }
    const target = selected; setGenerating(true); setError(""); setHistoryId("");
    try {
      const { report } = await api<{ report: Report }>(`/api/topics/${target}/summarize`, { ...post({ kind, ...(kind === "week" ? { weekStart: week } : {}), ...(selectedProvider && activeModel ? { provider: selectedProvider, apiKey: activeModel.apiKey, model: activeModel.model } : {}) }), signal: AbortSignal.timeout(170_000) });
      if (activeRef.current === target) { setDetail(old => old ? { ...old, reports: [report, ...old.reports] } : old); setToast(kind === "week" ? "本周回顾已生成。" : "话题总结已更新，原始对话完整保留。"); }
    } catch (e) { setError((e as Error).name === "TimeoutError" ? "生成时间较长，请稍后刷新查看，或重新尝试。" : (e as Error).message); }
    finally { setGenerating(false); }
  }

  async function confirmDelete() {
    if (!deleting) return; setSaving(true); setFormError("");
    try {
      await api(deleting.kind === "topic" ? `/api/topics/${deleting.id}` : `/api/conversations/${deleting.id}`, { method: "DELETE" });
      if (deleting.kind === "topic") { home(); await refreshTopics(); }
      else if (selected) { setSourceView(null); setHistoryId(""); await Promise.all([reloadDetail(selected), refreshTopics()]); }
      setDeleting(null); setToast("已删除。");
    } catch (e) { setFormError((e as Error).message); } finally { setSaving(false); }
  }

  const visibleTopics = topics.filter(t => `${t.title} ${t.description}`.toLowerCase().includes(search.toLowerCase()));
  const total = topics.reduce((n, t) => n + t.count, 0);
  const reports = detail?.reports.filter(r => tab === "week" ? r.kind === "week" && r.weekStart === week : r.kind === "topic") || [];
  const report = (historyId ? reports.find(r => r.id === historyId) : reports[0]) || reports[0];
  const scopedConversations = detail?.conversations.filter(c => tab !== "week" || inImportWeek(c.importedAt, week)) || [];
  const newCount = scopedConversations.filter(c => !report?.sourceIds.includes(c.id)).length;
  const originals = detail?.conversations.filter(c => (sourceFilter === "全部" || c.source === sourceFilter) && `${c.title} ${c.content}`.toLowerCase().includes(originalSearch.toLowerCase())).slice().reverse() || [];

  function exportReport() {
    if (!report || !detail) return;
    const s = report.summary;
    const item = (x: SummaryItem) => `- ${x.text} [原文：${x.sourceIds.map(id => detail.conversations.find(c => c.id === id)?.title || id).join("、")}]`;
    const text = [`# ${detail.topic.title}${tab === "week" ? " · 每周回顾 " + weekLabel(week) : " · 话题总结"}${demo ? "（示例）" : ""}`, `生成于：${dateLabel(report.createdAt, true)}\n模型记录：${modelIdentityText(report.modelInfo, report.model)}\n`, tab === "week" ? "本报告按北京时间的导入日期筛选，不代表原始对话发生于本周。\n" : "", `## 简短概览\n${s.overview}`, `## 内容详述\n${s.highlights.map(x => highlightMarkdown(x, item)).join("\n\n")}`, `## 已明确的想法\n${s.positions.length ? s.positions.map(item).join("\n") : "原文中没有足够明确的个人意向或决定。"}`, `## 待明确的问题\n${s.questions.length ? s.questions.map(item).join("\n") : "暂无。"}`, s.suggestions.length ? `## 补充建议\n${s.suggestions.map(item).join("\n")}` : "", s.uncertainty ? `## 整理说明\n${s.uncertainty}` : "", `## 原始对话\n${detail.conversations.filter(c => report.sourceIds.includes(c.id)).map(c => `### ${c.title}\n来源：${c.source}；导入时间：${dateLabel(c.importedAt, true)}；对话日期：${c.conversationDate || "未提供"}\n\n${c.content}`).join("\n\n---\n\n")}`].filter(Boolean).join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `${detail.topic.title.replace(/[<>:"/\\|?*]/g, "_")}-${tab === "week" ? week : "总结"}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); setToast("总结与对应原文已导出。");
  }

  function references(ids: string[]) {
    return <span className="references">{ids.map(id => { const c = detail?.conversations.find(c => c.id === id); return c ? <button key={id} onClick={() => setSourceView(c)} title={c.title}><Link2 size={11} />{c.source}<span className="sr-only">：{c.title}</span></button> : null; })}</span>;
  }

  return <div className="app-shell">
    {mobileNav && <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <button className="brand-button" onClick={() => home()} aria-label="拾言首页"><Brand /></button>
      <div className="workspace-label"><span className="workspace-avatar">言</span><div>我的思考空间<small>PERSONAL WORKSPACE</small></div><Leaf size={14} /></div>
      <nav aria-label="主导航"><button className={page === "topics" && !selected ? "active" : ""} onClick={() => home()} disabled={generating}><BookOpen size={18} />我的话题<span className="nav-count">{topics.length}</span></button><button className={page === "weekly" && !selected ? "active" : ""} onClick={() => home("weekly")} disabled={generating}><CalendarDays size={18} />每周回顾</button></nav>
      <div className="sidebar-section"><span>话题收藏</span><button className="icon-button" onClick={() => showModal("topic")} aria-label="新建话题" disabled={generating}><Plus size={16} /></button></div>
      <div className="sidebar-topics">{topics.length ? topics.map(t => <button key={t.id} className={selected === t.id ? "active" : ""} onClick={() => openTopic(t.id)} disabled={generating}><span className={`topic-dot ${t.color}`} /><span>{t.title}</span><small>{t.count}</small></button>) : <p className="sidebar-empty">每个关心的问题，<br />都值得有一个自己的角落。</p>}</div>
      <div className="sidebar-bottom"><div className="sidebar-note"><span>“</span><p>对话会结束，<br />思考可以留下。</p><Leaf size={37} strokeWidth={1} /></div><button onClick={() => showModal("guide")}><CircleHelp size={17} />使用指南<ArrowUpRight size={14} /></button><button onClick={() => showModal("settings")}><Settings2 size={17} />模型设置<span className={`connection-dot ${canGenerate ? "connected" : ""}`} /></button><a href={accountEnabled ? "/account" : "/signout-with-chatgpt?return_to=/"} target="_top"><span className="user-avatar">{displayName.slice(0, 1).toUpperCase()}</span><span>我的账号<small>私人空间</small></span>{accountEnabled ? <ArrowUpRight size={15} /> : <LogOut size={15} />}</a></div>
    </aside>

    <div className="main-shell"><header className="topbar"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMobileNav(true)}><Menu size={21} /></button><div className="breadcrumb"><span>我的空间</span><ChevronRight size={13} /><span>{selected ? detail?.topic.title || "话题" : page === "weekly" ? "每周回顾" : "我的话题"}</span></div><div className="topbar-right"><label className="global-search"><Search size={16} /><input aria-label="搜索话题" placeholder="搜索我的话题…" value={search} onChange={e => { if (generating) return; setSearch(e.target.value); setSelected(null); setDetail(null); setDemo(false); setPage("topics"); }} /><kbd>⌕</kbd></label><span className="private-label"><span />私人空间</span><button className="top-avatar" onClick={() => showModal("settings")} aria-label="打开模型设置">{displayName.slice(0, 1).toUpperCase()}</button></div></header>

    <main className="content">
      {error && <div className="notice error" role="alert"><AlertCircle size={17} /><span>{error}</span><button className="text-button" onClick={() => { setError(""); if (selected && !demo) reloadDetail(selected).catch(e => setError(e.message)); else refreshTopics().catch(e => setError(e.message)); }}>重试</button><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError("")}><X size={16} /></button></div>}
      {!selected ? <>
        <div className="page-eyebrow"><span />{page === "topics" ? "留住对话里的每一点思考" : "给这一周的思考，留一页记录"}</div>
        <div className="page-heading"><div><h1>{page === "topics" ? "我的话题" : "每周回顾"}<span className="heading-period">.</span></h1><p>{page === "topics" ? "把散落在不同 AI 里的对话，整理成自己的思考。" : "按导入时间，回顾这一周留下了什么。"}</p></div><button className="button primary" onClick={() => showModal("topic")}><Plus size={17} />新建话题</button></div>

        {page === "topics" && <section className="welcome-card"><div className="welcome-copy"><div className="eyebrow"><span className="tiny-star">✳</span> 每次对话，都有所留</div><h2>聊过的想法，<br />值得被好好收藏。</h2><p>粘贴对话，拾起重点。<br className="mobile-only" />让零散的交流，成为清晰的积累。</p><button className="button dark" onClick={() => showModal("topic")}>{topics.length ? "开启一个新话题" : "创建我的第一个话题"}<ArrowUpRight size={17} /></button><button className="welcome-demo" onClick={showDemo}>先看看整理效果 <ArrowRight size={14} /></button></div><div className="paper-scene" aria-hidden="true"><div className="paper paper-back"><span /><span /><span /></div><div className="floating-source floating-gpt">✳</div><div className="floating-source floating-doubao">豆</div><div className="floating-source floating-deepseek">D</div><div className="paper paper-front"><div className="paper-top"><span className="paper-mark"><Leaf size={17} /></span><span>我的思考记录</span><span>↗</span></div><h3>零散对话，清晰留存。</h3><div className="paper-line long" /><div className="paper-line" /><div className="paper-divider" /><div className="paper-check"><span>✓</span><div className="paper-line long" /></div><div className="paper-check"><span>✓</span><div className="paper-line" /></div><div className="paper-check"><span>✓</span><div className="paper-line medium" /></div><div className="paper-bottom"><span className="paper-tag">灵感已收好</span><span>3 min read</span></div></div><div className="scene-caption"><Sparkles size={14} />让信息沉淀，让思考生长</div></div></section>}

        {page === "topics" ? <>
          <div className="collection-header"><h2>话题收藏 <span>{topics.length.toString().padStart(2, "0")}</span></h2><span>{total} 段对话，慢慢积累</span></div>
          {loading ? <div className="loading-state"><LoaderCircle className="spin" />正在打开你的空间…</div> : visibleTopics.length ? <div className="topic-grid">{visibleTopics.map(t => <button className={`topic-card ${t.color}`} key={t.id} onClick={() => openTopic(t.id)}><div className="topic-card-top"><span className="topic-icon">{t.title.includes("求职") ? <GraduationCap size={24} strokeWidth={1.5} /> : <FolderOpen size={23} strokeWidth={1.5} />}</span><ArrowUpRight size={18} /></div><h3>{t.title}</h3><p>{t.description || "从一段对话开始，慢慢整理这个话题。"}</p><div className="topic-card-sources">{t.sources.length ? t.sources.map(s => <SourceBadge source={s} key={s} />) : <span className="muted">等待第一段对话</span>}</div><div className="topic-card-bottom"><span><MessageSquare size={13} />{t.count} 段对话</span><span>{dateLabel(t.updatedAt)}更新</span></div></button>)}<button className="new-topic-card" onClick={() => showModal("topic")}><span><Plus size={22} /></span><strong>开启一个新话题</strong><p>给新的思考，留一点空间</p></button></div> : search ? <div className="empty-search"><Search size={28} /><h3>没有找到相关话题</h3><p>换一个关键词，或创建新话题。</p></div> : <div className="onboarding"><div className="onboarding-heading"><span className="outline-icon"><BookOpen size={22} /></span><div><h3>你的思考收藏，从这里开始</h3><p>还没有话题，三个小步骤就能开始。</p></div></div><div className="onboarding-steps"><div><span>01</span><h4>选一个关心的话题</h4><p>求职准备、学习计划，或一个灵感。</p></div><ChevronRight size={17} /><div><span>02</span><h4>粘贴聊过的内容</h4><p>来自豆包、DeepSeek 或 ChatGPT。</p></div><ChevronRight size={17} /><div><span>03</span><h4>读一份清晰的总结</h4><p>回顾步骤、例子与完整要点。</p></div></div></div>}
          <div className="bottom-note"><Leaf size={14} /><span>不必记住每一句话，留下对你有意义的部分就好。</span></div>
        </> : <><div className="weekly-toolbar"><div className="week-switch"><button className="icon-button" onClick={() => setWeek(w => shiftWeek(w, -1))} aria-label="上一周"><ChevronLeft size={17} /></button><strong>{weekLabel(week)}</strong><button className="icon-button" onClick={() => setWeek(w => shiftWeek(w, 1))} disabled={week >= currentWeek()} aria-label="下一周"><ChevronRight size={17} /></button></div><span>北京时间 · 按导入日期归档</span></div><div className="notice subtle"><CalendarDays size={18} /><span>选择一个话题，生成或阅读这一周的精简回顾。原始对话可能发生于更早的时间。</span></div>{loading ? <div className="loading-state"><LoaderCircle className="spin" />正在加载…</div> : topics.length ? <div className="weekly-list">{topics.map(t => <button key={t.id} onClick={() => openTopic(t.id, "week")}><span className={`weekly-icon ${t.color}`}><BookOpen size={23} /></span><div><h3>{t.title}</h3><p>{t.count} 段已保存对话 · 查看 {weekLabel(week)} 回顾</p></div><span>打开回顾 <ArrowRight size={16} /></span></button>)}</div> : <div className="empty-search"><CalendarDays size={32} /><h3>给这一周留一点记录</h3><p>创建话题并添加对话后，就可以生成每周回顾。</p><button className="button primary" onClick={() => showModal("topic")}><Plus size={16} />创建话题</button></div>}</>}
      </> : detailLoading ? <div className="loading-state full"><LoaderCircle className="spin" />正在打开话题…</div> : detail ? <>
        <button className="back-link" onClick={() => home(page)} disabled={generating}><ArrowLeft size={15} />返回{page === "weekly" ? "每周回顾" : "我的话题"}</button>
        {demo && <div className="notice demo-notice"><Sparkles size={17} /><span>这是示例话题，用来预览整理效果，不会保存到你的空间。</span><button className="text-button" onClick={() => showModal("topic")}>创建我的话题 <ArrowRight size={14} /></button></div>}
        <div className="detail-heading"><div className={`detail-topic-icon ${detail.topic.color}`}><GraduationCap size={29} strokeWidth={1.5} /></div><div><span className="eyebrow">TOPIC COLLECTION</span><h1>{detail.topic.title}</h1><p>{detail.topic.description || "留住关于这个话题的每一点思考。"}</p></div><div className="detail-actions">{!demo && <button className="button primary" onClick={() => showModal("import")} disabled={generating}><Plus size={16} />添加对话</button>}{!demo && <button className="icon-button danger-hover" aria-label="删除话题" onClick={() => { setFormError(""); setDeleting({ kind: "topic", id: detail.topic.id, title: detail.topic.title }); }} disabled={generating}><Trash2 size={17} /></button>}</div></div>
        <div className="detail-meta"><span><MessageSquare size={14} />{detail.conversations.length} 段原始对话</span><span className="meta-divider" />{detail.topic.sources.map(s => <SourceBadge source={s} key={s} />)}<span className="detail-updated"><Clock3 size={13} />{dateLabel(detail.topic.updatedAt)}更新</span></div>
        <div className="tabs" role="tablist" aria-label="话题内容"><button role="tab" aria-selected={tab === "summary"} className={tab === "summary" ? "active" : ""} onClick={() => { setTab("summary"); setHistoryId(""); }} disabled={generating}><Sparkles size={16} />话题总结</button><button role="tab" aria-selected={tab === "originals"} className={tab === "originals" ? "active" : ""} onClick={() => setTab("originals")} disabled={generating}><MessageSquare size={16} />原始对话<span>{detail.conversations.length}</span></button><button role="tab" aria-selected={tab === "week"} className={tab === "week" ? "active" : ""} onClick={() => { setTab("week"); setHistoryId(""); }} disabled={generating}><CalendarDays size={16} />每周回顾</button></div>
        {tab === "originals" ? <><div className="originals-toolbar"><label className="inline-search"><Search size={16} /><input value={originalSearch} onChange={e => setOriginalSearch(e.target.value)} placeholder="搜索对话标题或原文…" aria-label="搜索原始对话" /></label><select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} aria-label="筛选来源"><option>全部</option>{sources.map(s => <option key={s}>{s}</option>)}</select></div><div className="original-list">{originals.length ? originals.map(c => <button key={c.id} className="original-card" onClick={() => setSourceView(c)}><div><SourceBadge source={c.source} /><span>{dateLabel(c.importedAt)}导入</span></div><h3>{c.title}</h3><p>{c.content.slice(0, 150)}</p><footer><span>{c.content.length.toLocaleString()} 字 · 对话日期{c.conversationDate ? " " + c.conversationDate : "未提供"}</span><span>查看原文 <ArrowUpRight size={14} /></span></footer></button>) : <div className="empty-search"><MessageSquare size={30} /><h3>{detail.conversations.length ? "没有找到相关对话" : "第一段对话，从这里开始"}</h3><p>{detail.conversations.length ? "试试其他关键词或来源。" : "粘贴完整对话，原始内容会被好好保存。"}</p>{!demo && !detail.conversations.length && <button className="button primary" onClick={() => showModal("import")}><Plus size={16} />添加对话</button>}</div>}</div></> : <>
          {tab === "week" && <div className="weekly-toolbar"><div className="week-switch"><button className="icon-button" onClick={() => { setWeek(w => shiftWeek(w, -1)); setHistoryId(""); }} disabled={generating} aria-label="上一周"><ChevronLeft size={17} /></button><strong>{weekLabel(week)}</strong><button className="icon-button" onClick={() => { setWeek(w => shiftWeek(w, 1)); setHistoryId(""); }} disabled={generating || week >= currentWeek()} aria-label="下一周"><ChevronRight size={17} /></button></div><span>本周导入 {scopedConversations.length} 段对话 · 北京时间</span></div>}
          {generating ? <div className="generating-state"><span className="generating-icon"><Sparkles size={32} /></span><h2>正在把零散的对话，慢慢理清</h2><p>合并重复内容，梳理重点，并核对原文出处。<br />通常需要几十秒，请稍候。</p><div className="generating-track"><span /></div><small>原始对话已经保存。</small></div> : report ? <div className="reading-layout"><article className="summary-paper"><div className="summary-top"><span><span className="status-dot" />{tab === "week" ? "每周回顾" : "话题总结"}</span><span>约 {Math.max(1, Math.ceil(JSON.stringify(report.summary).length / 650))} 分钟阅读</span></div><h2>{tab === "week" ? "这一周，留下了这些思考。" : "聊过的重点，都在这里。"}</h2><p className="summary-intro">{report.summary.overview}</p>{tab === "week" && <p className="weekly-caveat">依据本周导入的内容整理，不代表对话均发生于本周。</p>}<div className="summary-rule" /><section className="summary-section" id="highlights"><div className="section-title"><span>01</span><h3>内容详述</h3><BookOpen size={15} /></div>{report.summary.highlights.map((h, i) => <div className="highlight" key={i}><h4>{h.title}</h4><p>{h.text}</p>{references(h.sourceIds)}<SummaryDetails highlight={h} references={references} /></div>)}</section><section className="summary-section" id="positions"><div className="section-title"><span>02</span><h3>你已明确的想法</h3><Check size={15} /></div>{report.summary.positions.length ? report.summary.positions.map((p, i) => <div className="position" key={i}><Check size={15} /><div><p>{p.text}</p>{references(p.sourceIds)}</div></div>) : <p className="empty-section">原文中还没有足够明确、且能确认由你表达的意向或决定。</p>}</section><section className="summary-section" id="questions"><div className="section-title"><span>03</span><h3>待明确的问题</h3><CircleHelp size={15} /></div>{report.summary.questions.length ? report.summary.questions.map((p, i) => <div className="question-item" key={i}><p>{p.text}</p>{references(p.sourceIds)}</div>) : <p className="empty-section">这次整理暂未发现明确悬而未决的问题。</p>}</section>{report.summary.suggestions.length > 0 && <section className="suggestion-box"><div><Leaf size={17} /><h3>一点补充建议</h3><span>仅供参考</span></div>{report.summary.suggestions.map((p, i) => <div key={i}><p>{p.text}</p>{references(p.sourceIds)}</div>)}</section>}{report.summary.uncertainty && <p className="uncertainty"><CircleHelp size={14} /><span>{report.summary.uncertainty}</span></p>}<footer className="summary-footer"><Brand small /><span>整理于 {dateLabel(report.createdAt, true)}</span></footer></article><aside className="reading-aside"><div className="reading-actions"><button className="button primary" onClick={() => generate(tab === "week" ? "week" : "topic")} disabled={demo || !scopedConversations.length}><Sparkles size={16} />{newCount ? "更新总结" : "重新整理"}</button><button className="button secondary" onClick={exportReport}><ArrowDownToLine size={16} />导出总结与原文</button></div>{newCount > 0 && <div className="update-note"><span /><p>有 {newCount} 段对话尚未纳入这份总结。</p></div>}<div className="reading-info"><h4>这份总结的依据</h4><p><MessageSquare size={15} />{report.sourceIds.length} 段原始对话</p><p><Clock3 size={15} />{dateLabel(report.createdAt)}整理</p><ModelIdentity info={report.modelInfo} model={report.model} /></div><div className="reading-toc"><span>快速浏览</span><a href="#highlights">内容详述 <ArrowDownToLine size={12} /></a><a href="#positions">你已明确的想法</a><a href="#questions">待明确的问题</a></div>{reports.length > 1 && <label className="history-select">整理记录<select value={report.id} onChange={e => setHistoryId(e.target.value)}>{reports.map((r, i) => <option key={r.id} value={r.id}>{dateLabel(r.createdAt, true)}{i === 0 ? " · 最新" : ""}</option>)}</select></label>}<div className="source-tip"><Link2 size={17} /><p>点击内容下方的来源标签，<br />随时回到原始对话。</p></div></aside></div> : <div className="summary-empty"><div className="summary-empty-icon"><Sparkles size={31} strokeWidth={1.3} /></div><span className="eyebrow">A LITTLE CLARITY</span><h2>{scopedConversations.length ? "让这些对话，变得更清晰。" : tab === "week" ? "这一周，还没有新的记录。" : "先留下一段对话，再拾起重点。"}</h2><p>{scopedConversations.length ? `已保存 ${scopedConversations.length} 段对话。整理成一份包含具体方法、步骤和例子的报告，\n直接阅读完整要点，也保留每一句原文。` : tab === "week" ? "周报根据导入时间生成，可以切换到其他周查看。" : "把不同 AI 中关于这个话题的内容粘贴进来，\n慢慢汇成你自己的思考记录。"}</p>{scopedConversations.length ? <button className="button primary" onClick={() => generate(tab === "week" ? "week" : "topic")} disabled={demo}><Sparkles size={17} />生成{tab === "week" ? "本周回顾" : "详细总结"}</button> : !demo && <button className="button primary" onClick={() => showModal("import")}><Plus size={17} />添加第一段对话</button>}{scopedConversations.length > 0 && !canGenerate && <small className="model-hint">首次整理前，在模型设置中填写 API Key 即可。</small>}<div className="summary-empty-features"><span><Check size={14} />保留步骤与例子</span><span><Check size={14} />区分想法与建议</span><span><Check size={14} />随时回看原文</span></div></div>}
        </>}
      </> : null}
    </main><footer className="app-footer"><span>拾言 v{APP_VERSION} · 让每次对话，都有所留</span><span>慢慢积累，自有回响 <Leaf size={12} /></span></footer></div>

    {toast && <div className="toast" role="status"><span><Check size={15} /></span>{toast}<button className="icon-button" onClick={() => setToast("")} aria-label="关闭提示"><X size={14} /></button></div>}

    {modal === "topic" && <Modal title="给一个话题，留一方空间" subtitle="从你正在关心的一个问题开始。" onClose={() => setModal(null)} busy={saving}><form onSubmit={createTopic}><label className="field">话题名称 <span>*</span><input autoFocus required maxLength={60} placeholder="例如：大学生求职" value={topicForm.title} onChange={e => setTopicForm({ ...topicForm, title: e.target.value })} /></label><label className="field">想整理些什么？ <small>选填</small><textarea rows={3} maxLength={500} placeholder="例如：重点整理岗位选择、简历修改和面试准备。" value={topicForm.description} onChange={e => setTopicForm({ ...topicForm, description: e.target.value })} /></label><fieldset className="color-field"><legend>给话题选个颜色</legend>{colors.map((c, i) => <button key={c} type="button" aria-label={["鼠尾草绿", "雾蓝", "陶土", "麦黄", "浅紫"][i]} aria-pressed={topicForm.color === c} className={`color-choice ${c} ${topicForm.color === c ? "selected" : ""}`} onClick={() => setTopicForm({ ...topicForm, color: c })}>{topicForm.color === c && <Check size={15} />}</button>)}</fieldset>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-footer"><button type="button" className="button secondary" onClick={() => setModal(null)} disabled={saving}>取消</button><button className="button primary" type="submit" disabled={saving || !topicForm.title.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}创建话题</button></div></form></Modal>}

    {modal === "import" && <Modal title="留下一段对话" subtitle={`添加到「${detail?.topic.title || "话题"}」· 可以分多次补充`} onClose={() => setModal(null)} busy={saving} wide><form onSubmit={saveConversation}><fieldset className="source-field"><legend>这段对话来自哪里？</legend><div>{sources.map(s => <button type="button" key={s} className={importForm.source === s ? "selected" : ""} aria-pressed={importForm.source === s} onClick={() => setImportForm({ ...importForm, source: s })}><SourceBadge source={s} />{importForm.source === s && <Check size={13} />}</button>)}</div></fieldset><label className="field">对话标题 <span>*</span><input autoFocus required maxLength={100} placeholder="例如：和 DeepSeek 聊了简历怎么改" value={importForm.title} onChange={e => setImportForm({ ...importForm, title: e.target.value })} /></label><label className="field">粘贴对话内容 <span>*</span><textarea className="paste-area" required minLength={10} maxLength={50000} rows={9} placeholder={"把你与 AI 的对话粘贴在这里…\n\n如果文本有角色标记，可以保留，例如：\n用户：我想了解内容运营岗位。\nAI：可以先从岗位要求和已有经历梳理。\n\n没有角色标记也可以保存，整理时会注明不确定。"} value={importForm.content} onChange={e => setImportForm({ ...importForm, content: e.target.value })} /><span className="textarea-count">{importForm.content.length.toLocaleString()} / 50,000 字</span></label><details className="date-details"><summary>补充原始对话日期 <span>选填</span></summary><label className="field"><input type="date" aria-label="原始对话日期" value={importForm.conversationDate} onChange={e => setImportForm({ ...importForm, conversationDate: e.target.value })} /><small>不知道可以留空。导入时间会自动记录，且与对话日期分开。</small></label></details>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-footer"><span className="save-note"><FileText size={14} />原文会完整保存</span><button type="button" className="button secondary" onClick={() => setModal(null)} disabled={saving}>稍后再说</button><button className="button primary" type="submit" disabled={saving || !importForm.title.trim() || importForm.content.trim().length < 10}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}保存对话</button></div></form></Modal>}

    {modal === "settings" && <Modal title="模型设置" subtitle="选择一个模型，整理属于你的思考。" onClose={() => setModal(null)}>
      <ModelSettings selectedProvider={selectedProvider} choices={modelChoices} serverModel={serverModel}
        onApply={(provider, choices) => { setSelectedProvider(provider); setModelChoices(choices); setModal(null); setToast(choices[provider]?.apiKey.trim() ? "已应用 " + providers[provider].label + " 模型配置。" : "已选择 " + providers[provider].label + "，填写 API Key 后即可整理。"); }}
        onClear={provider => { setModelChoices(previous => ({ ...previous, [provider]: { apiKey: "", model: previous[provider]?.model || providers[provider].models[0] } })); setToast("已清除 " + providers[provider].label + " 的临时密钥。"); }}
        onUseServer={() => { setSelectedProvider(null); setModal(null); setToast("已切换到服务端模型配置。"); }} />
    </Modal>}

    {modal === "guide" && <Modal title="把对话，变成自己的积累" subtitle="三步开始，之后随时回来补充。" onClose={() => setModal(null)}><div className="guide-list"><section><span>01</span><div><h3>创建一个具体的话题</h3><p>例如“大学生求职”，并写下你想整理的范围。</p></div></section><section><span>02</span><div><h3>把相关对话粘贴进来</h3><p>每次添加一段，选择来源、写个标题。保留“用户：”“AI：”等标记，有助于区分说话者。相同文本不会重复导入。</p></div></section><section><span>03</span><div><h3>生成总结，随时回到原文</h3><p>配置模型后，点击生成总结。添加新对话后可更新总结；每次整理都会保留记录。每周回顾按北京时间的导入日期计算。</p></div></section></div><div className="guide-footer"><Leaf size={19} /><p>没有 API Key 也能先创建话题、保存原文，稍后再整理。</p></div><div className="modal-footer"><button className="button secondary" onClick={() => { setModal(null); showDemo(); }}>看看示例 <ArrowUpRight size={15} /></button><button className="button primary" onClick={() => setModal(null)}>知道了 <Check size={15} /></button></div></Modal>}

    {sourceView && <Modal title={sourceView.title} subtitle="完整原文 · 供你核对整理结果" onClose={() => setSourceView(null)} busy={saving} wide><div className="source-view-meta"><SourceBadge source={sourceView.source} /><span>{dateLabel(sourceView.importedAt, true)}导入</span><span>对话日期：{sourceView.conversationDate || "未提供"}</span></div><pre className="source-content">{sourceView.content}</pre><div className="modal-footer">{!demo && <button className="text-button danger" onClick={() => { setFormError(""); setDeleting({ kind: "conversation", id: sourceView.id, title: sourceView.title }); }}><Trash2 size={15} />删除对话</button>}<button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(sourceView.content); setToast("原文已复制。"); } catch { setToast("复制未成功，可以在原文中手动选择并复制。"); } }}><Copy size={15} />复制原文</button><button className="button primary" onClick={() => setSourceView(null)}>返回阅读</button></div></Modal>}

    {deleting && <Modal title={deleting.kind === "topic" ? "删除这个话题？" : "删除这段对话？"} onClose={() => setDeleting(null)} busy={saving}><p className="delete-description">「{deleting.title}」{deleting.kind === "topic" ? "及其中保存的原文和总结都会删除。" : "会被删除；该话题已有的总结也会清除，之后可以根据剩余对话重新生成。"}此操作无法撤销。</p>{formError && <p className="form-error">{formError}</p>}<div className="modal-footer"><button className="button secondary" onClick={() => setDeleting(null)} disabled={saving}>保留</button><button className="button destructive" onClick={confirmDelete} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}确认删除</button></div></Modal>}
  </div>;
}
