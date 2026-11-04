import { api, context, json, ApiError } from "@/lib/server";
import type { Conversation } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const GET = api(async (_request: Request, route: Params) => {
  const { db, ownerId } = await context(); const { id } = await route.params;
  const conversation = await db.prepare("SELECT c.id, c.topic_id AS topicId, c.title, c.source, c.content, c.conversation_date AS conversationDate, c.imported_at AS importedAt FROM conversations c INNER JOIN topics t ON c.topic_id = t.id WHERE c.id = ? AND t.owner_id = ?")
    .bind(id, ownerId).first<Conversation>();
  if (!conversation) throw new ApiError("没有找到这段对话。", 404);
  return json({ conversation });
});

export const DELETE = api(async (_request: Request, route: Params) => {
  const { db, ownerId } = await context(); const { id } = await route.params;
  const row = await db.prepare("SELECT c.topic_id AS topicId FROM conversations c INNER JOIN topics t ON c.topic_id = t.id WHERE c.id = ? AND t.owner_id = ?").bind(id, ownerId).first<{ topicId: string }>();
  if (!row) throw new ApiError("没有找到这段对话。", 404);
  await db.batch([
    db.prepare(`UPDATE memories SET source_conversation_id = (SELECT e.conversation_id FROM memory_evidence e WHERE e.memory_id=memories.id AND e.conversation_id<>? ORDER BY e.created_at LIMIT 1) WHERE owner_id=? AND source_conversation_id=? AND EXISTS (SELECT 1 FROM memory_evidence e WHERE e.memory_id=memories.id AND e.conversation_id<>?)`).bind(id,ownerId,id,id),
    db.prepare("DELETE FROM conversations WHERE id = ? AND topic_id IN (SELECT id FROM topics WHERE owner_id = ?)").bind(id, ownerId),
    db.prepare("DELETE FROM reports WHERE topic_id = ?").bind(row.topicId),
    db.prepare("UPDATE topics SET updated_at = ? WHERE id = ? AND owner_id = ?").bind(new Date().toISOString(), row.topicId, ownerId),
  ]);
  return json({ ok: true });
});
