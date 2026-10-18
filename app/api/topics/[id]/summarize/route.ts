import { z } from "zod";
import { api, body, context, json, ownedTopic, runtime, conversationSQL, ApiError } from "@/lib/server";
import { currentWeek, inImportWeek, summaryInput, SUMMARY_SYSTEM, validateSummary } from "@/lib/summary";
import type { Conversation } from "@/lib/types";
import { providerIds } from "@/lib/providers";
import { resolveModelConfig, buildModelRequest, ModelConfigurationError } from "@/lib/model-config";

export const POST = api(async (request: Request, route: { params: Promise<{ id: string }> }) => {
  const { db, ownerId } = await context(); const { id } = await route.params;
  const topic = await ownedTopic(db, ownerId, id);
  const parsed = z.object({ kind: z.enum(["topic", "week"]).default("topic"), weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), provider: z.enum(providerIds).optional(), apiKey: z.string().max(500).optional(), model: z.string().trim().min(1).max(100).optional() }).strict().safeParse(await body(request));
  if (!parsed.success) throw new ApiError("总结请求格式不正确。");
  const { kind } = parsed.data;
  const weekStart = kind === "week" ? parsed.data.weekStart || currentWeek() : null;
  if (weekStart && (Number.isNaN(Date.parse(weekStart)) || new Date(weekStart).toISOString().slice(0, 10) !== weekStart || new Date(weekStart + "T00:00:00Z").getUTCDay() !== 1)) throw new ApiError("周报日期需要是有效的周一。");
  const all = (await db.prepare(conversationSQL).bind(id).all<Conversation>()).results;
  const conversations = weekStart ? all.filter(c => inImportWeek(c.importedAt, weekStart)) : all;
  if (!conversations.length) throw new ApiError(kind === "week" ? "这一周还没有导入对话。" : "先添加一段对话，再生成总结。");
  const input = summaryInput(topic, conversations, kind, weekStart || undefined);
  if (input.length > 180_000) throw new ApiError("当前话题内容较多，请拆分为更具体的话题后整理；本次没有截断原文。", 413);
  let config;
  let requestConfig;
  try {
    config = resolveModelConfig(parsed.data, runtime());
    requestConfig = buildModelRequest(config, SUMMARY_SYSTEM, input);
  } catch (error) {
    if (error instanceof ModelConfigurationError) throw new ApiError(error.message, error.status);
    throw new ApiError("模型服务配置不正确，请检查后重试。", 503);
  }
  const model = config.model;
  let upstream: Response;
  try {
    upstream = await fetch(requestConfig.endpoint, { ...requestConfig.init, signal: AbortSignal.timeout(90_000) });
  } catch { throw new ApiError("模型连接超时或暂时不可用。原始对话已保存，请稍后重试。", 504); }
  if (!upstream.ok) {
    const message = upstream.status === 401 ? "API Key 无效，请确认密钥与所选提供商一致。" : upstream.status === 402 ? "模型账户余额不足，请检查后重试。" : upstream.status === 403 ? "当前账户无权调用该模型，请检查模型权限及密钥所属地域。" : upstream.status === 400 || upstream.status === 404 ? "模型名称或调用参数不受支持，请换用预设模型，或检查该模型是否支持 JSON 输出。" : upstream.status === 429 ? "模型请求较频繁，请稍后重试。" : "模型暂时无法完成总结，请稍后重试。";
    throw new ApiError(message, 502);
  }
  let summary;
  try {
    const completion = await upstream.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    if (completion.choices?.[0]?.finish_reason === "length") throw new Error();
    const text = completion.choices?.[0]?.message?.content;
    if (!text) throw new Error();
    summary = validateSummary(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")), conversations);
  } catch { throw new ApiError("模型返回的总结或原文引用不完整，请重新生成；原来的总结仍保留。", 502); }
  const reportId = crypto.randomUUID(); const now = new Date().toISOString();
  await ownedTopic(db, ownerId, id);
  const existing = (await db.prepare("SELECT id FROM conversations WHERE topic_id = ?").bind(id).all<{ id: string }>()).results;
  if (conversations.some(c => !existing.some(e => e.id === c.id))) throw new ApiError("生成期间原始对话发生了删除，请重新生成。", 409);
  const report = { id: reportId, topicId: id, kind, weekStart, summary, sourceIds: conversations.map(c => c.id), model, createdAt: now };
  const inserted = await db.prepare("INSERT INTO reports (id, topic_id, kind, week_start, summary_json, source_ids_json, model, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM topics WHERE id = ? AND owner_id = ?) AND (SELECT COUNT(*) FROM conversations WHERE topic_id = ? AND id IN (SELECT value FROM json_each(?))) = ?").bind(reportId, id, kind, weekStart, JSON.stringify(summary), JSON.stringify(report.sourceIds), model, now, id, ownerId, id, JSON.stringify(report.sourceIds), report.sourceIds.length).run();
  if (inserted.meta.changes === 0) throw new ApiError("生成期间原文或话题已被删除，请刷新后重新整理。", 409);
  return json({ report }, 201);
});
