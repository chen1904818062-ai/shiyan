"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { defaultChoice, providerIds, providers, type ModelChoices, type ProviderId, type DiscoveredModel } from "@/lib/providers";

type Props = {
  selectedProvider: ProviderId | null; choices: ModelChoices; serverModel: { configured: boolean; model: string };
  onApply: (provider: ProviderId, choices: ModelChoices) => void; onClear: (provider: ProviderId) => void; onUseServer: () => void;
};
export default function ModelSettings({ selectedProvider, choices, serverModel, onApply, onClear, onUseServer }: Props) {
  const [provider, setProvider] = useState<ProviderId>(selectedProvider || "deepseek");
  const [drafts, setDrafts] = useState<ModelChoices>(choices);
  const [manual, setManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef({ provider, key: "" });
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const definition = providers[provider];
  const choice = drafts[provider] || defaultChoice(provider);
  latest.current = { provider, key: choice.apiKey };
  useEffect(() => () => { sequence.current++; abort.current?.abort(); }, []);
  function invalidate() { sequence.current++; abort.current?.abort(); setLoading(false); setError(""); }
  function update(patch: Partial<typeof choice>) { setDrafts(old => ({ ...old, [provider]: { ...(old[provider] || defaultChoice(provider)), ...patch } })); }
  async function readModels() {
    const apiKey = choice.apiKey.trim(); if (!apiKey) { setError("请先填写 API Key。"); return; }
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const id = ++sequence.current; const requestedProvider = provider; const originalKey = choice.apiKey;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/model/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: requestedProvider, apiKey }), cache: "no-store", signal: controller.signal });
      const data = await response.json() as { models?: DiscoveredModel[]; error?: string };
      if (!response.ok || !data.models?.length) throw new Error(data.error || "平台没有返回可用的模型列表。");
      if (id !== sequence.current || latest.current.provider !== requestedProvider || latest.current.key !== originalKey) return;
      const models = data.models;
      setDrafts(old => {
        const current = old[requestedProvider] || defaultChoice(requestedProvider);
        return { ...old, [requestedProvider]: { ...current, availableModels: models, model: models.some(m => m.id === current.model) ? current.model : models.length === 1 ? models[0].id : "" } };
      });
      setManual(false);
    } catch (failure) {
      if (id === sequence.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "读取失败，请重试。");
    } finally { if (id === sequence.current) setLoading(false); }
  }
  const models = choice.availableModels || [];
  return <form onSubmit={event => {
    event.preventDefault(); if (!choice.apiKey.trim() || !choice.model.trim() || loading) return;
    onApply(provider, { ...drafts, [provider]: { ...choice, apiKey: choice.apiKey.trim(), model: choice.model.trim() } });
  }}>
    <label className="field">模型提供商<select aria-label="模型提供商" autoFocus value={provider} onChange={event => { invalidate(); setManual(false); setProvider(event.target.value as ProviderId); }}>{providerIds.map(id => <option key={id} value={id}>{providers[id].label}</option>)}</select></label>
    <div className="settings-provider-card"><span className={`provider-logo ${provider}`}>{definition.mark}</span><div><strong>{definition.label}</strong><small>从平台读取模型，再选择调用型号</small></div><a href={definition.keyURL} target="_blank" rel="noreferrer">获取 API Key <ArrowUpRight size={13} /></a></div>
    <label className="field">{definition.label} API Key<input aria-label={definition.label + " API Key"} key={provider} type="password" autoComplete="off" spellCheck={false} placeholder={`粘贴 ${definition.label} 的 API Key`} value={choice.apiKey} maxLength={500} onChange={event => { invalidate(); setManual(false); update({ apiKey: event.target.value, model: "", availableModels: undefined }); }} onBlur={() => { if (choice.apiKey.trim() && !models.length && !loading) void readModels(); }} /><small>{definition.note}</small></label>
    <div className="catalog-controls"><button className="button secondary" type="button" onClick={() => void readModels()} disabled={loading || !choice.apiKey.trim()}>{loading ? <LoaderCircle size={15} className="spin" /> : null}{loading ? "正在读取…" : "读取可用模型"}</button><span role="status">{models.length ? `平台返回 ${models.length} 个型号` : "API Key 可能有权调用多个型号"}</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <label className="field">模型<select aria-label="模型" disabled={loading} value={manual ? "custom" : choice.model} onChange={event => { setManual(event.target.value === "custom"); update({ model: event.target.value === "custom" ? "" : event.target.value }); }}>
      <option value="">{loading ? "正在读取模型列表…" : models.length ? "请选择本次要使用的型号" : "先填写密钥并读取模型列表"}</option>
      {choice.model && !manual && !models.some(m => m.id === choice.model) && <option value={choice.model}>{choice.model} · 已应用，未重新读取</option>}
      {models.map(model => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</option>)}
      <option value="custom">平台控制台确认的其他型号…</option>
    </select></label>
    {manual && <label className="field">自定义模型名称<input aria-label="自定义模型名称" required maxLength={100} value={choice.model} onChange={event => update({ model: event.target.value })} placeholder="填写平台控制台确认的模型 ID" /><small>手动填写不代表已识别或验证；不会自动换用其他型号。</small></label>}
    <p className="settings-note">列表来自平台接口，不是预设名单。多型号时由你选择；能否调用以及是否支持 JSON 输出，以实际生成结果为准。</p>
    {serverModel.configured && <div className="notice subtle server-model-option"><span>服务端已配置 {serverModel.model}。</span><button type="button" className="text-button" onClick={onUseServer}>使用服务端配置</button></div>}
    <p className="settings-note">密钥仅保存在当前页面内存，刷新或关闭后需重新填写。读取列表时仅发送密钥；生成时，对话会发送给所选平台。报告会分别记录请求型号和接口返回型号。</p>
    <div className="modal-footer"><button type="button" className="text-button" onClick={() => { invalidate(); update({ apiKey: "", model: "", availableModels: undefined }); onClear(provider); }}>清除当前提供商密钥</button><button className="button primary" type="submit" disabled={loading || !choice.apiKey.trim() || !choice.model.trim()}><Check size={16} />应用配置</button></div>
  </form>;
}
