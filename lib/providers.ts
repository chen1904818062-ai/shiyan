export const providerIds = ["deepseek", "glm", "qwen", "kimi"] as const;
export type ProviderId = typeof providerIds[number];
export type DiscoveredModel = { id: string; name: string };
export type ModelChoice = { apiKey: string; model: string; availableModels?: DiscoveredModel[] };
export type ModelChoices = Partial<Record<ProviderId, ModelChoice>>;

type Provider = { label: string; mark: string; baseURL: string; models: readonly string[]; keyURL: string; note: string };

// Official regional endpoints only. Browser requests cannot supply arbitrary URLs.
export const providers: Record<ProviderId, Provider> = {
  deepseek: {
    label: "DeepSeek", mark: "D", baseURL: "https://api.deepseek.com",
    models: ["deepseek-flash", "deepseek-v4-pro"],
    keyURL: "https://platform.deepseek.com/api_keys", note: "使用 DeepSeek 开放平台的 API Key。",
  },
  glm: {
    label: "智谱 GLM", mark: "G", baseURL: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4.7", "glm-4.7-flashx"],
    keyURL: "https://bigmodel.cn/", note: "使用智谱 BigModel 开放平台的 API Key。",
  },
  qwen: {
    label: "通义千问", mark: "Q", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-flash"],
    keyURL: "https://bailian.console.aliyun.com/", note: "使用阿里云百炼北京地域的 API Key。",
  },
  kimi: {
    label: "Kimi", mark: "K", baseURL: "https://api.moonshot.cn/v1",
    models: ["kimi-k2.6"],
    keyURL: "https://platform.moonshot.cn/console/api-keys", note: "使用 Moonshot 中国站开放平台的 API Key。",
  },
};

export function defaultChoice(provider: ProviderId): ModelChoice {
  return { apiKey: "", model: "" };
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (providerIds as readonly string[]).includes(value);
}
