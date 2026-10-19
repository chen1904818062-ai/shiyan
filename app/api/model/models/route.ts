import { z } from "zod";
import { api, body, context, json, ApiError } from "@/lib/server";
import { providerIds } from "@/lib/providers";
import { discoverModels, ModelCatalogError } from "@/lib/model-catalog";

export const POST = api(async (request: Request) => {
  await context();
  const parsed = z.object({ provider: z.enum(providerIds), apiKey: z.string().trim().min(1).max(500) }).strict().safeParse(await body(request));
  if (!parsed.success) throw new ApiError("请选择平台并填写 API Key。");
  try { return json({ models: await discoverModels(parsed.data.provider, parsed.data.apiKey), note: "型号来自平台接口；具体调用权限、余额和 JSON 支持以实际生成为准。" }); }
  catch (error) {
    if (error instanceof ModelCatalogError) throw new ApiError(error.message, error.status);
    throw new ApiError("读取模型列表失败，请稍后重试。", 502);
  }
});
