import { api, context, ApiError } from "@/lib/server";

// A database-backed per-account lease also covers multiple server processes.
// The token prevents a timed-out operation releasing a newer operation's lease.
export function modelApi<T extends unknown[]>(handler: (...args:T)=>Promise<Response>) {
  return api(async (...args:T) => {
    const {db,ownerId} = await context();
    const token = crypto.randomUUID();
    const now = Date.now();
    const acquired = await db.prepare(`INSERT INTO model_operations (owner_id,token,expires_at) VALUES (?,?,?)
      ON CONFLICT(owner_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE model_operations.expires_at<=?
      RETURNING token`).bind(ownerId,token,now+180_000,now).first();
    if (!acquired) throw new ApiError("已有模型任务正在进行，请等待完成后重试。",429);
    try { return await handler(...args); }
    finally { await db.prepare("DELETE FROM model_operations WHERE owner_id=? AND token=?").bind(ownerId,token).run(); }
  });
}
