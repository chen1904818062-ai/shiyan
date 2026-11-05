import { api, body, context, json, ApiError } from "@/lib/server";
import { z } from "zod";
import { memoryKinds, sensitivityLevels } from "@/lib/memory/taxonomy";
import { saveAcceptedMemories } from "@/lib/memory/repo";
import { isMemoryKind, memoryStatuses } from "@/lib/memory/taxonomy";
import { listMemories, memoryStats } from "@/lib/memory/repo";

export const GET = api(async (request: Request) => {
  const { db, ownerId } = await context();
  const url = new URL(request.url);
  const kinds = (url.searchParams.get("kind") || "").split(",").filter(isMemoryKind);
  const statusParam = url.searchParams.get("status") || "";
  const status = (memoryStatuses as readonly string[]).includes(statusParam) ? statusParam : undefined;
  const topicId = url.searchParams.get("topicId") || undefined;
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60) || undefined;
  const limit = Number(url.searchParams.get("limit") || 200);
  const offset = Math.max(0, Math.min(1_000_000, Math.floor(Number(url.searchParams.get("offset")) || 0)));
  const [memories, stats] = await Promise.all([
    listMemories(db, ownerId, { kinds, status, topicId, q, limit: Number.isFinite(limit) ? Math.floor(limit) : 200, offset }),
    memoryStats(db, ownerId),
  ]);
  return json({ memories, stats });
});

export const POST = api(async (request: Request) => {
  const { db, ownerId } = await context();
  const parsed = z.object({ statement: z.string().trim().min(4).max(200), detail: z.string().trim().max(600).default(""), kind: z.enum(memoryKinds), sensitivity: z.enum(sensitivityLevels).default("normal") }).strict().safeParse(await body(request));
  if (!parsed.success) throw new ApiError("请填写4～200字的记忆及有效类型。", 400);
  const now = new Date().toISOString();
  const existing = await db.prepare("SELECT id FROM topics WHERE owner_id = ? AND title = '个人记忆补充' ORDER BY created_at LIMIT 1").bind(ownerId).first<{id: string}>();
  const topicId = existing?.id || crypto.randomUUID();
  const id = crypto.randomUUID();
  const content = `用户：${parsed.data.statement}${parsed.data.detail ? "\n" + parsed.data.detail : ""}`;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)))).map(b => b.toString(16).padStart(2, "0")).join("");
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO topics (id,owner_id,title,description,color,created_at,updated_at) VALUES (?,?,'个人记忆补充','','sage',?,?)").bind(topicId,ownerId,now,now),
    db.prepare("INSERT OR IGNORE INTO conversations (id,topic_id,title,source,content,content_hash,imported_at) VALUES (?,?,?,'其他',?,?,?)").bind(id,topicId,parsed.data.statement.slice(0,80),content,hash,now),
  ]);
  const source = await db.prepare("SELECT id FROM conversations WHERE topic_id = ? AND content_hash = ?").bind(topicId,hash).first<{id:string}>();
  if (!source) throw new ApiError("保存失败，请重试。", 409);
  const saved = await saveAcceptedMemories(db, ownerId, [{ draft: { ...parsed.data, quote: parsed.data.statement, occurredAt: null, occurredPrecision: "unknown", basis: "stated" }, conversationId: source.id, start: 3, end: 3 + parsed.data.statement.length, role: "user", confidence: "low" }]);
  if (!saved.touched.length) throw new ApiError("保存期间原文已被删除，请刷新后重试。",409);
  await db.prepare("INSERT OR IGNORE INTO memory_extractions(conversation_id,owner_id,extracted_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM conversations WHERE id=?)").bind(source.id,ownerId,now,source.id).run();
  return json({ memory: (await listMemories(db, ownerId, {id:saved.touched[0],limit:1}))[0] }, 201);
});
