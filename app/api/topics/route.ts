import { z } from "zod";
import { api, body, context, json, ApiError } from "@/lib/server";

export const GET = api(async () => {
  const { db, ownerId } = await context();
  const { results } = await db.prepare(`SELECT t.id, t.title, t.description, t.color, t.created_at AS createdAt, t.updated_at AS updatedAt, COUNT(c.id) AS count, GROUP_CONCAT(DISTINCT c.source) AS sourceList FROM topics t LEFT JOIN conversations c ON c.topic_id = t.id WHERE t.owner_id = ? GROUP BY t.id ORDER BY t.updated_at DESC, t.id ASC`).bind(ownerId).all();
  return json({ topics: results.map(({ sourceList, ...topic }) => ({ ...topic, sources: typeof sourceList === "string" ? sourceList.split(",") : [] })) });
});

export const POST = api(async (request: Request) => {
  const { db, ownerId } = await context();
  const parsed = z.object({ title: z.string().trim().min(1).max(60), description: z.string().trim().max(500).default(""), color: z.enum(["sage", "clay", "blue", "gold", "lilac"]).default("sage") }).safeParse(await body(request));
  if (!parsed.success) throw new ApiError("请填写话题名称（最多60字），整理范围最多500字。");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare("INSERT INTO topics (id, owner_id, title, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, ownerId, parsed.data.title, parsed.data.description, parsed.data.color, now, now).run();
  return json({ topic: { id, ...parsed.data, createdAt: now, updatedAt: now, count: 0, sources: [] } }, 201);
});
