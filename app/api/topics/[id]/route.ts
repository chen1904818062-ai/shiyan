import { api, context, json, ownedTopic, conversationSQL } from "@/lib/server";
import type { Conversation } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const GET = api(async (_request: Request, route: Params) => {
  const { db, ownerId } = await context(); const { id } = await route.params;
  const topic = await ownedTopic(db, ownerId, id);
  const conversations = (await db.prepare(conversationSQL).bind(id).all<Conversation>()).results;
  const reports = (await db.prepare("SELECT id, topic_id AS topicId, kind, week_start AS weekStart, summary_json AS summaryJson, source_ids_json AS sourceIdsJson, model, created_at AS createdAt FROM reports WHERE topic_id = ? ORDER BY created_at DESC, id DESC LIMIT 100").bind(id).all()).results.map(({ summaryJson, sourceIdsJson, ...report }) => ({ ...report, summary: JSON.parse(summaryJson as string), sourceIds: JSON.parse(sourceIdsJson as string) }));
  return json({ topic: { ...topic, count: conversations.length, sources: [...new Set(conversations.map(c => c.source))] }, conversations, reports });
});

export const DELETE = api(async (_request: Request, route: Params) => {
  const { db, ownerId } = await context(); const { id } = await route.params;
  await ownedTopic(db, ownerId, id);
  await db.batch([
    db.prepare("DELETE FROM reports WHERE topic_id = ? AND EXISTS (SELECT 1 FROM topics WHERE id = ? AND owner_id = ?)").bind(id, id, ownerId),
    db.prepare("DELETE FROM conversations WHERE topic_id = ? AND EXISTS (SELECT 1 FROM topics WHERE id = ? AND owner_id = ?)").bind(id, id, ownerId),
    db.prepare("DELETE FROM topics WHERE id = ? AND owner_id = ?").bind(id, ownerId),
  ]);
  return json({ ok: true });
});
