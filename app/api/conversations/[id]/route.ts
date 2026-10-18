import { api, context, json, ApiError } from "@/lib/server";

export const DELETE = api(async (_request: Request, route: { params: Promise<{ id: string }> }) => {
  const { db, ownerId } = await context(); const { id } = await route.params;
  const row = await db.prepare("SELECT c.topic_id AS topicId FROM conversations c INNER JOIN topics t ON c.topic_id = t.id WHERE c.id = ? AND t.owner_id = ?").bind(id, ownerId).first<{ topicId: string }>();
  if (!row) throw new ApiError("没有找到这段对话。", 404);
  await db.batch([
    db.prepare("DELETE FROM conversations WHERE id = ? AND topic_id IN (SELECT id FROM topics WHERE owner_id = ?)").bind(id, ownerId),
    db.prepare("DELETE FROM reports WHERE topic_id = ?").bind(row.topicId),
    db.prepare("UPDATE topics SET updated_at = ? WHERE id = ? AND owner_id = ?").bind(new Date().toISOString(), row.topicId, ownerId),
  ]);
  return json({ ok: true });
});
