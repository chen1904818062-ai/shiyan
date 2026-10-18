import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

import { ApiError } from "./http-common";
export * from "./http-common";

export function runtime() {
  return env as unknown as { DB: D1Database; MODEL_API_KEY?: string; MODEL_PROVIDER?: string; MODEL_BASE_URL?: string; MODEL_NAME?: string };
}

export async function context() {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError("请先登录后使用。", 401);
  const { DB } = runtime();
  if (!DB) throw new ApiError("数据服务暂未就绪，请稍后重试。", 503);
  return { db: DB, ownerId: user.userId };
}
