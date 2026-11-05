import { modelApi } from "@/lib/model-operation";
import { upstreamJson } from "@/lib/upstream-json";
import { z } from "zod";
import { body, context, json, runtime, ApiError } from "@/lib/server";
import { listMemories, searchMemories } from "@/lib/memory/repo";
import { RECALL_SYSTEM, validateRecall } from "@/lib/memory/recall";
import { stripJsonFence } from "@/lib/memory/extract";
import { providerIds } from "@/lib/providers";
import { resolveModelConfig, buildModelRequest, ModelConfigurationError } from "@/lib/model-config";
import { modelIdentity } from "@/lib/model-response";

export const POST = modelApi(async (request: Request) => {
  const { db, ownerId } = await context();
  const parsed = z.object({ question: z.string().trim().min(2).max(2000), mode: z.enum(["recall", "plan"]).default("recall"), includePrivate: z.boolean().default(false), provider: z.enum(providerIds).optional(), apiKey: z.string().max(500).optional(), model: z.string().trim().min(1).max(100).optional() }).strict().safeParse(await body(request));
  if (!parsed.success) throw new ApiError("请填写2～2000字的问题。", 400);
  const { selected, matched, eligible } = await searchMemories(db, ownerId, parsed.data.question, parsed.data.includePrivate);
  if (!selected.length) throw new ApiError(eligible ? "没有检索到与问题相关的记忆。本次未调用模型，请换用原记录中的关键词或补充资料。" : "还没有可调用的已确认记忆。请先在记忆库确认内容，或允许本次使用私密记忆。", 422);
  let config;
  try { config = resolveModelConfig(parsed.data, runtime()); }
  catch (e) { if (e instanceof ModelConfigurationError) throw new ApiError(e.message, e.status); throw e; }
  const input = JSON.stringify({ question: parsed.data.question, mode: parsed.data.mode, retrieval: matched ? "关键词匹配" : "无关键词匹配，使用近期已确认记忆，可能不相关", memories: selected });
  if (input.length > 100_000) throw new ApiError("相关记忆的证据较多，请缩小问题范围后重试。", 413);
  const call = buildModelRequest(config, RECALL_SYSTEM, input);
  let upstream: Response;
  try { upstream = await fetch(call.endpoint, { ...call.init, signal: AbortSignal.timeout(150_000) }); }
  catch { throw new ApiError("记忆调用暂时超时，请稍后重试。已保存的记忆不受影响。", 504); }
  if (!upstream.ok) throw new ApiError(upstream.status === 401 ? "API Key 无效，请检查模型配置。" : upstream.status === 429 ? "模型请求较频繁，请稍后重试。" : "模型未能完成回答，请检查权限、余额或型号后重试。", 502);
  let result; let modelInfo;
  try {
    const completion = await upstreamJson(upstream) as { model?: unknown; choices?: { message?: { content?: string }; finish_reason?: string }[] };
    if (completion.choices?.[0]?.finish_reason === "length") throw new Error();
    result = validateRecall(JSON.parse(stripJsonFence(completion.choices?.[0]?.message?.content || "")), selected, parsed.data.mode);
    modelInfo = modelIdentity(config.model, completion.model);
  } catch { throw new ApiError("回答格式或记忆引用不完整，请重试。", 502); }
  const current = await listMemories(db, ownerId, { status: "confirmed", ids: selected.map(m=>m.id), limit: 24 });
  if (selected.some(m => !current.some(c => c.id === m.id && JSON.stringify(c) === JSON.stringify(m)))) throw new ApiError("生成期间记忆已发生变化，请重新提问。", 409);
  return json({ result, memories: selected, matched, eligible, retrieval: "full-corpus-lexical", modelInfo });
});
