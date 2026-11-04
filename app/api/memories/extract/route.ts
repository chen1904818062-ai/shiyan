import { z } from "zod";
import { api, body, context, json, runtime, ApiError } from "@/lib/server";
import { providerIds } from "@/lib/providers";
import { resolveModelConfig, buildModelRequest, ModelConfigurationError } from "@/lib/model-config";
import { MEMORY_INPUT_LIMIT, MEMORY_SYSTEM, memoryInput, stripJsonFence } from "@/lib/memory/extract";
import { describeRejections, validateMemoryDrafts, type RejectionCode } from "@/lib/memory/validate";
import { saveAcceptedMemories } from "@/lib/memory/repo";

type ConversationRow = {
  id: string; topicId: string; title: string; source: string; content: string;
  conversationDate: string | null; importedAt: string;
};

const SELECT_CONVERSATION = `SELECT c.id, c.topic_id AS topicId, c.title, c.source, c.content,
  c.conversation_date AS conversationDate, c.imported_at AS importedAt
  FROM conversations c INNER JOIN topics t ON t.id = c.topic_id WHERE t.owner_id = ?`;

function upstreamMessage(status: number) {
  if (status === 401) return "API Key 无效，请确认密钥与所选提供商一致。";
  if (status === 402) return "模型账户余额不足，请检查后重试。";
  if (status === 403) return "当前账户无权调用该模型，请检查模型权限及密钥所属地域。";
  if (status === 400 || status === 404) return "模型名称或调用参数不受支持，请换用预设模型，或检查该模型是否支持 JSON 输出。";
  if (status === 429) return "模型请求较频繁，请稍后重试。";
  return "模型暂时无法完成记忆提炼，请稍后重试。";
}

export const POST = api(async (request: Request) => {
  const { db, ownerId } = await context();
  const parsed = z.object({
    conversationId: z.string().min(1).max(100).optional(),
    topicId: z.string().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(1).default(1),
    provider: z.enum(providerIds).optional(),
    apiKey: z.string().max(500).optional(),
    model: z.string().trim().min(1).max(100).optional(),
  }).strict().safeParse(await body(request));
  if (!parsed.success || (!parsed.data.conversationId && !parsed.data.topicId)) throw new ApiError("请选择要提炼记忆的对话或话题。");

  let conversations: ConversationRow[];
  if (parsed.data.conversationId) {
    const row = await db.prepare(`${SELECT_CONVERSATION} AND c.id = ?`).bind(ownerId, parsed.data.conversationId).first<ConversationRow>();
    if (!row) throw new ApiError("没有找到这段对话。", 404);
    conversations = [row];
  } else {
    const { results } = await db.prepare(`${SELECT_CONVERSATION} AND c.topic_id = ?
      AND NOT EXISTS (SELECT 1 FROM memory_extractions e WHERE e.conversation_id = c.id AND e.owner_id = t.owner_id)
      ORDER BY c.imported_at DESC, c.id DESC LIMIT ?`).bind(ownerId, parsed.data.topicId, parsed.data.limit).all<ConversationRow>();
    conversations = results;
  }
  if (!conversations.length) throw new ApiError("这个话题里的对话都已经提炼过了。", 409);

  let config;
  try {
    config = resolveModelConfig(parsed.data, runtime());
  } catch (error) {
    if (error instanceof ModelConfigurationError) throw new ApiError(error.message, error.status);
    throw new ApiError("模型服务配置不正确，请检查后重试。", 503);
  }

  let created = 0;
  let merged = 0;
  let processed = 0;
  const skipped: string[] = [];
  const rejected: Partial<Record<RejectionCode, number>> = {};

  for (const conversation of conversations) {
    const input = memoryInput(conversation);
    if (input.length > MEMORY_INPUT_LIMIT) { skipped.push(conversation.title); continue; }
    const requestConfig = buildModelRequest(config, MEMORY_SYSTEM, input);
    let upstream: Response;
    try {
      upstream = await fetch(requestConfig.endpoint, { ...requestConfig.init, signal: AbortSignal.timeout(120_000) });
    } catch {
      if (processed === 0) throw new ApiError("模型连接超时或暂时不可用。原始对话已保存，请稍后重试。", 504);
      break;
    }
    if (!upstream.ok) {
      if (processed === 0) throw new ApiError(upstreamMessage(upstream.status), 502);
      break;
    }
    let drafts: unknown;
    try {
      const completion = await upstream.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
      if (completion.choices?.[0]?.finish_reason === "length") throw new Error();
      const text = completion.choices?.[0]?.message?.content;
      if (!text) throw new Error();
      drafts = JSON.parse(stripJsonFence(text));
    } catch {
      if (processed === 0) throw new ApiError("模型返回的记忆格式不完整，请重新提炼；原始对话仍完整保留。", 502);
      break;
    }
    const result = validateMemoryDrafts(drafts, conversation);
    for (const [code, count] of Object.entries(result.rejected)) {
      rejected[code as RejectionCode] = (rejected[code as RejectionCode] || 0) + (count || 0);
    }
    const live = await db.prepare(`${SELECT_CONVERSATION} AND c.id = ?`).bind(ownerId,conversation.id).first();
    if (!live) throw new ApiError("提炼期间原文已被删除，请刷新。",409);
    if (result.rejected.invalid) throw new ApiError("模型返回的记忆字段不完整，请重试。",502);
    const saved = await saveAcceptedMemories(db, ownerId, result.accepted);
    await db.prepare("INSERT OR IGNORE INTO memory_extractions (conversation_id,owner_id,extracted_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM conversations c INNER JOIN topics t ON t.id=c.topic_id WHERE c.id=? AND t.owner_id=?)").bind(conversation.id,ownerId,new Date().toISOString(),conversation.id,ownerId).run();
    created += saved.created;
    merged += saved.merged;
    processed++;
  }

  const remainingRow = parsed.data.conversationId ? null : await db.prepare(`SELECT COUNT(*) AS n FROM conversations c
    INNER JOIN topics t ON t.id = c.topic_id
    WHERE t.owner_id = ? AND c.topic_id = ? AND NOT EXISTS (SELECT 1 FROM memory_extractions e WHERE e.conversation_id = c.id AND e.owner_id = t.owner_id)`)
    .bind(ownerId, parsed.data.topicId).first<{ n: number }>();

  return json({
    processed,
    created,
    merged,
    skipped,
    remaining: Number(remainingRow?.n || 0),
    rejected: describeRejections(rejected),
  }, 201);
});
