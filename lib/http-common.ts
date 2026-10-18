export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function api<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try { return await fn(...args); }
    catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError) return json({ error: "提交的内容格式不正确。" }, 400);
      return json({ error: "操作暂时失败，请稍后重试。" }, 500);
    }
  };
}

export async function body(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError("请从本网站提交内容。", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError("请使用 JSON 格式提交内容。", 415);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 600_000) throw new ApiError("这次粘贴的内容过长，请分次添加。", 413);
  return JSON.parse(text);
}

export async function ownedTopic(db: D1Database, ownerId: string, id: string) {
  const topic = await db.prepare("SELECT id, title, description, color, created_at AS createdAt, updated_at AS updatedAt FROM topics WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<{ id: string; title: string; description: string; color: string; createdAt: string; updatedAt: string }>();
  if (!topic) throw new ApiError("没有找到这个话题。", 404);
  return topic;
}

export const conversationSQL = "SELECT id, topic_id AS topicId, title, source, content, conversation_date AS conversationDate, imported_at AS importedAt FROM conversations WHERE topic_id = ? ORDER BY imported_at ASC, id ASC";
