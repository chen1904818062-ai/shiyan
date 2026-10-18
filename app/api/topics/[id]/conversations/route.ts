import { z } from "zod";
import { api, body, context, json, ownedTopic, ApiError } from "@/lib/server";

export const POST = api(async (request: Request, route: { params: Promise<{ id: string }> }) => {
  const { db, ownerId } = await context(); const { id: topicId } = await route.params;
  await ownedTopic(db, ownerId, topicId);
  const parsed = z.object({ title: z.string().trim().min(1).max(100), source: z.enum(["ChatGPT", "豆包", "DeepSeek", "其他"]), content: z.string().min(10).max(50000).refine(value => value.trim().length >= 10), conversationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }).safeParse(await body(request));
  if (!parsed.success) throw new ApiError("请填写标题和10～50,000字的对话内容，并选择来源。");
  const { title, source, content, conversationDate } = parsed.data;
  if (conversationDate && (!Number.isFinite(Date.parse(conversationDate)) || new Date(conversationDate).toISOString().slice(0, 10) !== conversationDate)) throw new ApiError("请填写有效的对话日期。");
  const canonical = content.replace(/\r\n/g, "\n").split("\n").map(line => line.trimEnd()).join("\n").trim();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)))).map(b => b.toString(16).padStart(2, "0")).join("");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare("INSERT OR IGNORE INTO conversations (id, topic_id, title, source, content, content_hash, conversation_date, imported_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM topics WHERE id = ? AND owner_id = ?)").bind(id, topicId, title, source, content, hash, conversationDate || null, now, topicId, ownerId),
    db.prepare("UPDATE topics SET updated_at = ? WHERE id = ? AND owner_id = ? AND EXISTS (SELECT 1 FROM conversations WHERE id = ?)").bind(now, topicId, ownerId, id),
  ]);
  if (results[0].meta.changes === 0) throw new ApiError("这段对话已经添加过了，无需重复导入。", 409);
  return json({ id }, 201);
});
