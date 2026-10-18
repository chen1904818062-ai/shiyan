import { AsyncLocalStorage } from "node:async_hooks";
import { ApiError } from "../lib/http-common.ts";

export * from "../lib/http-common.ts";
export const requests = new AsyncLocalStorage<{ ownerId: string }>();
let database: D1Database;
export function setDatabase(db: D1Database) { database = db; }
export function runtime() {
  return { DB: database, MODEL_API_KEY: process.env.MODEL_API_KEY, MODEL_PROVIDER: process.env.MODEL_PROVIDER, MODEL_BASE_URL: process.env.MODEL_BASE_URL, MODEL_NAME: process.env.MODEL_NAME };
}
export async function context() {
  const user = requests.getStore();
  if (!user) throw new ApiError("请先登录后使用。", 401);
  return { db: database, ownerId: user.ownerId };
}
