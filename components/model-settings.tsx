"use client";

import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { defaultChoice, providerIds, providers, type ModelChoices, type ProviderId } from "@/lib/providers";

type Props = {
  selectedProvider: ProviderId | null;
  choices: ModelChoices;
  serverModel: { configured: boolean; model: string };
  onApply: (provider: ProviderId, choices: ModelChoices) => void;
  onClear: (provider: ProviderId) => void;
  onUseServer: () => void;
};

export default function ModelSettings({ selectedProvider, choices, serverModel, onApply, onClear, onUseServer }: Props) {
  const [provider, setProvider] = useState<ProviderId>(selectedProvider || "deepseek");
  const [drafts, setDrafts] = useState<ModelChoices>(choices);
  const [customModels, setCustomModels] = useState<Partial<Record<ProviderId, boolean>>>({});
  const definition = providers[provider];
  const choice = drafts[provider] || defaultChoice(provider);
  const custom = customModels[provider] ?? !definition.models.includes(choice.model);

  function update(patch: Partial<typeof choice>) {
    setDrafts(previous => ({ ...previous, [provider]: { ...(previous[provider] || defaultChoice(provider)), ...patch } }));
  }

  return <form onSubmit={e => {
    e.preventDefault();
    const normalized = Object.fromEntries(Object.entries(drafts).map(([id, value]) => [id, { apiKey: value.apiKey.trim(), model: value.model.trim() }]));
    onApply(provider, { ...normalized, [provider]: { apiKey: choice.apiKey.trim(), model: choice.model.trim() } });
  }}>
    <label className="field">模型提供商
      <select aria-label="模型提供商" autoFocus value={provider} onChange={e => setProvider(e.target.value as ProviderId)}>
        {providerIds.map(id => <option key={id} value={id}>{providers[id].label}</option>)}
      </select>
    </label>
    <div className="settings-provider-card">
      <span className={`provider-logo ${provider}`} aria-hidden="true">{definition.mark}</span>
      <div><strong>{definition.label}</strong><small>用于生成话题总结和每周回顾</small></div>
      <a href={definition.keyURL} target="_blank" rel="noreferrer">获取 API Key <ArrowUpRight size={13} /></a>
    </div>
    <label className="field">{definition.label} API Key
      <input aria-label={definition.label + " API Key"} key={provider} type="password" autoComplete="off" spellCheck={false} placeholder={`粘贴 ${definition.label} 的 API Key`} value={choice.apiKey} onChange={e => update({ apiKey: e.target.value })} maxLength={500} />
      <small>{definition.note}</small>
    </label>
    <label className="field">模型
      <select aria-label="模型" value={custom ? "custom" : choice.model} onChange={e => {
        setCustomModels(previous => ({ ...previous, [provider]: e.target.value === "custom" }));
        if (e.target.value !== "custom") update({ model: e.target.value });
      }}>
        {definition.models.map((model, i) => <option key={model} value={model}>{model}{i === 0 ? " · 默认" : ""}</option>)}
        <option value="custom">自定义模型名称…</option>
      </select>
    </label>
    {custom && <label className="field">自定义模型名称
      <input aria-label="自定义模型名称" required maxLength={100} value={choice.model} onChange={e => update({ model: e.target.value })} placeholder="填写该提供商支持的模型 ID" />
      <small>需要是该提供商中可调用、并支持 JSON 输出的模型。</small>
    </label>}
    {serverModel.configured && <div className="notice subtle server-model-option"><span>服务端已配置 {serverModel.model}。</span><button type="button" className="text-button" onClick={onUseServer}>使用服务端配置</button></div>}
    <p className="settings-note">各提供商的密钥分别保存在当前页面内存中，刷新或关闭页面后需要重新填写。生成时，对话内容会发送给当前选定的{definition.label}。</p>
    <p className="settings-note">对话来源与总结模型相互独立，你可以用任意已配置的模型整理粘贴的对话。</p>
    <div className="modal-footer"><button type="button" className="text-button" onClick={() => { update({ apiKey: "" }); onClear(provider); }}>清除当前提供商密钥</button><button className="button primary" type="submit" disabled={!choice.model.trim()}><Check size={16} />应用配置</button></div>
  </form>;
}
