import { isProviderId, providerIds, providers, type ProviderId } from "./providers.ts";

export type ServerModelConfig = { MODEL_API_KEY?: string; MODEL_PROVIDER?: string; MODEL_BASE_URL?: string; MODEL_NAME?: string };
type ModelInput = { provider?: ProviderId; apiKey?: string; model?: string };
export type ResolvedModel = { apiKey: string; baseURL: string; model: string; provider: ProviderId | null };

export class ModelConfigurationError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status = status; }
}

function inferProvider(baseURL: string): ProviderId | null {
  const base = baseURL.replace(/\/+$/, "");
  if (base === "https://api.deepseek.com/v1") return "deepseek";
  return providerIds.find(id => providers[id].baseURL === base) || null;
}

export function resolveModelConfig(input: ModelInput, server: ServerModelConfig): ResolvedModel {
  const suppliedKey = input.apiKey?.trim();
  if (suppliedKey) {
    const provider = input.provider ?? "deepseek";
    if (!isProviderId(provider)) throw new ModelConfigurationError("请选择支持的模型提供商。", 400);
    return { apiKey: suppliedKey, provider, baseURL: providers[provider].baseURL, model: input.model?.trim() || providers[provider].models[0] };
  }
  // An explicitly selected provider must not borrow another provider's server key.
  if (input.provider !== undefined || input.apiKey !== undefined || !server.MODEL_API_KEY?.trim()) {
    throw new ModelConfigurationError("请先为选定的模型提供商填写 API Key。对话已经保存，可以稍后再整理。");
  }
  if (server.MODEL_PROVIDER && !isProviderId(server.MODEL_PROVIDER)) throw new ModelConfigurationError("服务端模型提供商配置不正确。", 503);
  const explicitProvider = isProviderId(server.MODEL_PROVIDER) ? server.MODEL_PROVIDER : null;
  const baseURL = server.MODEL_BASE_URL || providers[explicitProvider || "deepseek"].baseURL;
  const inferredProvider = inferProvider(baseURL);
  if (explicitProvider && inferredProvider && explicitProvider !== inferredProvider) throw new ModelConfigurationError("服务端模型提供商与接口地址不一致。", 503);
  const provider = explicitProvider || inferredProvider;
  return { apiKey: server.MODEL_API_KEY.trim(), baseURL, provider, model: server.MODEL_NAME || providers[provider || "deepseek"].models[0] };
}

export function buildModelRequest(config: ResolvedModel, system: string, input: string) {
  const endpoint = new URL(config.baseURL.replace(/\/+$/, "") + "/chat/completions");
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new ModelConfigurationError("模型服务地址需要是有效的 HTTPS 地址。", 503);
  let extras: Record<string, unknown> = {};
  if (config.provider === "deepseek") extras = { thinking: { type: "disabled" }, temperature: 0.2 };
  else if (config.provider === "glm" && /^glm-4\./.test(config.model)) extras = { thinking: { type: "disabled" }, temperature: 0.2 };
  else if (config.provider === "qwen") extras = { enable_thinking: false };
  else if (config.provider === "kimi" && /^kimi-k2\.[56]$/.test(config.model)) extras = { thinking: { type: "disabled" } };
  else if (config.provider === "kimi" && config.model.startsWith("kimi-k3")) extras = { reasoning_effort: "low" };
  return {
    endpoint: endpoint.toString(),
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: system }, { role: "user", content: input }], response_format: { type: "json_object" }, max_tokens: 3500, ...extras, stream: false }),
      redirect: "error" as const,
    },
  };
}
