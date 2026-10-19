import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { ApiError } from "../lib/http-common.ts";

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, (error, key) => error ? reject(error) : resolve(key)));
}
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createAuth(db: D1Database, password: string, origin: URL) {
  if (password.length < 16 && process.env.APP_PUBLIC_SIGNUP !== "true") throw new Error("APP_ACCESS_PASSWORD must contain at least 16 characters");
  const salt = randomBytes(32);
  const verifier = await derive(password, salt);
  const secure = origin.protocol === "https:";
  const ownerId = process.env.APP_OWNER_ID || "shiyan-private-owner";
  const cookieName = secure ? "__Host-shiyan_session" : "shiyan_session";
  const cookie = (token: string, maxAge: number) => `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

  async function user(request: Request) {
    const tokens = (request.headers.get("cookie") || "").split(";").map(c => c.trim()).filter(c => c.startsWith(cookieName + "=")).map(c => c.slice(cookieName.length + 1));
    if (tokens.length !== 1 || !/^[a-f0-9]{64}$/.test(tokens[0])) return null;
    const tokenHash = sha256(tokens[0]);
    return await db.prepare("SELECT owner_id AS ownerId FROM shiyan_sessions WHERE token_hash = ? AND expires_at > ?").bind(tokenHash, Date.now()).first<{ ownerId: string }>();
  }

  function sameOrigin(request: Request) {
    if (request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.has("origin") && request.headers.get("origin") !== origin.origin)) throw new ApiError("请从本站提交。", 403);
  }

  async function login(request: Request, address: string) {
    sameOrigin(request);
    if (password.length < 16) throw new ApiError("原空间密码登录未开放，请使用验证码登录。", 403);
    const linked = await db.prepare("SELECT user_id FROM shiyan_identities WHERE user_id = ? LIMIT 1").bind(ownerId).first();
    if (process.env.APP_PUBLIC_SIGNUP === "true" && linked) throw new ApiError("原空间已绑定账号，请使用手机或邮箱验证码登录。", 403);
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new ApiError("登录请求格式不正确。", 415);
    const sourceHash = sha256(address);
    const now = Date.now();
    await db.prepare("INSERT INTO shiyan_login_attempts (source_hash, window_start, attempts) VALUES (?, ?, 1) ON CONFLICT(source_hash) DO UPDATE SET attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END, window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END").bind(sourceHash, now, now - 900_000, now - 900_000).run();
    const attempts = await db.prepare("SELECT attempts FROM shiyan_login_attempts WHERE source_hash = ?").bind(sourceHash).first<{ attempts: number }>();
    if ((attempts?.attempts || 0) > 10) throw new ApiError("尝试较多，请15分钟后再试。", 429);
    const supplied = new URLSearchParams(await request.text()).get("password") || "";
    if (supplied.length > 1000 || !timingSafeEqual(await derive(supplied, salt), verifier)) throw new ApiError("访问密码不正确。", 401);
    const token = randomBytes(32).toString("hex");
    await db.batch([
      db.prepare("DELETE FROM shiyan_sessions WHERE expires_at <= ?").bind(now),
      db.prepare("DELETE FROM shiyan_login_attempts WHERE source_hash = ? OR window_start < ?").bind(sourceHash, now - 86400_000),
      db.prepare("INSERT INTO shiyan_sessions (token_hash, owner_id, expires_at) VALUES (?, ?, ?)").bind(sha256(token), ownerId, now + 8 * 3600_000),
    ]);
    return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": cookie(token, 8 * 3600), "Cache-Control": "no-store" } });
  }

  async function logout(request: Request) {
    sameOrigin(request);
    const token = (request.headers.get("cookie") || "").split(";").map(c => c.trim()).find(c => c.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
    if (token) await db.prepare("DELETE FROM shiyan_sessions WHERE token_hash = ?").bind(sha256(token)).run();
    return new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": cookie("", 0), "Cache-Control": "no-store" } });
  }

  return { user, login, logout, sameOrigin };
}
