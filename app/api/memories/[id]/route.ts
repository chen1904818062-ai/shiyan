import { z } from "zod";
import { api, body, context, json, ApiError } from "@/lib/server";
import { memoryKinds, sensitivityLevels } from "@/lib/memory/taxonomy";
import { statementKey } from "@/lib/memory/merge";
import { listMemories } from "@/lib/memory/repo";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }).strict(),
  z.object({ action: z.literal("retract"), reason: z.string().trim().max(200).default("") }).strict(),
  z.object({ action: z.literal("expire"), reason: z.string().trim().max(200).default("") }).strict(),
  z.object({
    action: z.literal("revise"),
    statement: z.string().trim().min(4).max(200).optional(),
    detail: z.string().trim().max(600).optional(),
    kind: z.enum(memoryKinds).optional(),
    sensitivity: z.enum(sensitivityLevels).optional(),
    reason: z.string().trim().max(200).default(""),
  }).strict(),
]);

type CurrentRow = { id: string; kind: string; statement: string; detail: string; status: string; confidence: string; sensitivity: string; updatedAt: string };

export const GET = api(async (_request: Request, route: Params) => {
  const {db,ownerId} = await context(); const {id} = await route.params;
  const [memory] = await listMemories(db,ownerId,{id,limit:1});
  if (!memory) throw new ApiError("没有找到这条记忆。",404);
  const revisions = await db.prepare("SELECT r.id, r.before_json AS beforeJson, r.after_json AS afterJson, r.reason, r.created_at AS createdAt FROM memory_revisions r INNER JOIN memories m ON m.id=r.memory_id WHERE r.memory_id=? AND m.owner_id=? ORDER BY r.created_at DESC, r.id DESC LIMIT 100").bind(id,ownerId).all();
  return json({memory,revisions:revisions.results});
});

export const PATCH = api(async (request: Request, route: Params) => {
  const { db, ownerId } = await context();
  const { id } = await route.params;
  const parsed = patchSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError("提交的修改内容不正确。");
  const current = await db.prepare("SELECT id, kind, statement, detail, status, confidence, sensitivity, updated_at AS updatedAt FROM memories WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId).first<CurrentRow>();
  if (!current) throw new ApiError("没有找到这条记忆。", 404);

  let statement = current.statement;
  let detail = current.detail;
  let kind = current.kind;
  let status = current.status;
  let confidence = current.confidence;
  let sensitivity = current.sensitivity;
  const reason = "reason" in parsed.data ? parsed.data.reason : "";

  if (parsed.data.action === "confirm") { status = "confirmed"; confidence = "high"; }
  else if (parsed.data.action === "retract") { status = "retracted"; }
  else if (parsed.data.action === "expire") { status = "expired"; }
  else {
    statement = parsed.data.statement ?? statement;
    detail = parsed.data.detail ?? detail;
    kind = parsed.data.kind ?? kind;
    sensitivity = parsed.data.sensitivity ?? sensitivity;
    status = "revised";
    if (statement === current.statement && detail === current.detail && kind === current.kind && sensitivity === current.sensitivity) throw new ApiError("内容没有变化，无需修订。");
  }

  const now = new Date().toISOString();
  const after = { statement, detail, kind, status, confidence, sensitivity };
  try {
    const results = await db.batch([
      db.prepare("UPDATE memories SET kind = ?, statement = ?, statement_key = ?, detail = ?, status = ?, confidence = ?, sensitivity = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND updated_at = ? AND status = ? AND statement = ?")
        .bind(kind, statement, statementKey(statement), detail, status, confidence, sensitivity, now, id, ownerId, current.updatedAt, current.status, current.statement),
      db.prepare("INSERT INTO memory_revisions (id, memory_id, before_json, after_json, reason, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0")
        .bind(crypto.randomUUID(), id, JSON.stringify(current), JSON.stringify(after), reason, now),
    ]);
    if (!results[0].meta.changes) throw new ApiError("记忆已被其他操作更新，请刷新后重试。",409);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("这次修改与已有记忆重复，请调整措辞后再试。", 409);
  }

  const [memory] = await listMemories(db, ownerId, { id, limit: 1 });
  return json({ memory });
});

export const DELETE = api(async (_request: Request, route: Params) => {
  const { db, ownerId } = await context();
  const { id } = await route.params;
  const result = await db.prepare("DELETE FROM memories WHERE id = ? AND owner_id = ?").bind(id, ownerId).run();
  if (result.meta.changes === 0) throw new ApiError("没有找到这条记忆。", 404);
  return json({ ok: true });
});
