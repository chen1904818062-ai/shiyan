import { providers, type ProviderId, type DiscoveredModel } from "./providers.ts";

export class ModelCatalogError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

export function parseModelCatalog(value: unknown): DiscoveredModel[] {
  const body = value as { data?: unknown; models?: unknown; output?: { models?: unknown } } | null;
  const list = body?.data ?? body?.models ?? body?.output?.models;
  if (!Array.isArray(list) || list.length > 2000) throw new ModelCatalogError("平台没有返回可识别的模型列表，请在平台控制台核对型号。");
  const models = new Map<string, DiscoveredModel>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { id?: unknown; model?: unknown; name?: unknown; output_modalities?: unknown; modalities?: unknown };
    // Omit explicitly non-text models. A missing capability field is not proof of permission or JSON support.
    if (Array.isArray(row.output_modalities) && !row.output_modalities.includes("text")) continue;
    const id = typeof row.id === "string" ? row.id.trim() : typeof row.model === "string" ? row.model.trim() : "";
    if (!id || id.length > 100 || /[\r\n\x00-\x1f]/.test(id)) continue;
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 150) : id;
    models.set(id, { id, name });
  }
  if (!models.size) throw new ModelCatalogError("平台返回的列表中没有可识别的文本模型，请在平台控制台核对型号。", 422);
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function discoverModels(provider: ProviderId, apiKey: string, fetcher: typeof fetch = fetch) {
  const endpoint = providers[provider].baseURL.replace(/\/+$/, "") + "/models";
  let response: Response;
  try { response = await fetcher(endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000) }); }
  catch { throw new ModelCatalogError("读取模型列表超时或平台暂时不可用，请重试。", 504); }
  if (!response.ok) {
    const message = response.status === 401 ? "API Key 无效，请确认密钥与平台一致。" : response.status === 403 ? "当前密钥无权读取模型列表，请核对平台权限与地域。" : response.status === 404 || response.status === 405 ? "该平台接口暂不支持读取模型列表，可在平台控制台确认后手动填写型号。" : response.status === 429 ? "读取较频繁，请稍后重试。" : "平台暂时无法提供模型列表，请稍后重试。";
    throw new ModelCatalogError(message, response.status === 401 || response.status === 403 ? response.status : 502);
  }
  try {
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error();
    return parseModelCatalog(JSON.parse(text));
  } catch (error) {
    if (error instanceof ModelCatalogError) throw error;
    throw new ModelCatalogError("平台返回的模型列表格式不正确，请稍后重试。");
  }
}
