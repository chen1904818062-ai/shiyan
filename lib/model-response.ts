import type { ModelInfo } from "./types";

export function modelIdentity(requestedModel: string, returned: unknown): ModelInfo {
  const returnedModel = typeof returned === "string" && returned.trim() && returned.length <= 200 ? returned.trim() : null;
  return { requestedModel, returnedModel, status: !returnedModel ? "unreported" : returnedModel === requestedModel ? "matched" : "different" };
}

export function modelIdentityText(info: ModelInfo | undefined, legacyModel: string) {
  if (!info) return `请求模型：${legacyModel}；历史记录未核验接口返回型号。`;
  if (!info.returnedModel) return `请求模型：${info.requestedModel}；接口未返回型号，暂无法核验。`;
  return `请求模型：${info.requestedModel}；接口返回：${info.returnedModel}。${info.status === "different" ? "返回型号与选择不同，可能涉及平台别名或版本映射。" : ""}`;
}
