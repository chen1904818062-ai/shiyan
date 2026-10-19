import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { ApiError, body, json } from "../lib/http-common.ts";
import { createDelivery, type Channel, type Delivery } from "./verification-delivery.ts";
import { sha256 } from "./auth.ts";

export function normalizeIdentity(channel: unknown, input: unknown): { channel: Channel; address: string } {
  if (typeof input !== "string" || input.length > 254) throw new ApiError("请填写有效的手机号或邮箱。");
  const value = input.trim();
  if (channel === "email") {
    const address = value.toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(address) || address.split("@")[0].length > 64) throw new ApiError("请填写有效的邮箱地址。");
    return { channel, address };
  }
  if (channel === "phone") {
    const number = value.replace(/[\s-]/g, "").replace(/^\+86/, "");
    if (!/^1[3-9]\d{9}$/.test(number)) throw new ApiError("请填写中国大陆11位手机号。");
    return { channel, address: `+86${number}` };
  }
  throw new ApiError("请选择手机号或邮箱登录。");
}
export function maskIdentity(channel: Channel, address: string) {
  if (channel === "phone") return `${address.slice(0, 6)}****${address.slice(-4)}`;
  const [name, domain] = address.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}
type Identity = { channel: Channel; address: string };
type Challenge = Identity & { id: string; owner_id: string | null; code_hash: string; attempts: number };

export function createAccounts(db: D1Database, origin: URL, options: { env?: NodeJS.ProcessEnv; delivery?: Delivery; now?: () => number } = {}) {
  const env = options.env || process.env;
  const enabled = env.APP_PUBLIC_SIGNUP === "true";
  const secret = env.APP_AUTH_SECRET || "";
  if (enabled && secret.length < 32) throw new Error("APP_AUTH_SECRET must contain at least 32 characters before enabling public signup");
  const delivery = options.delivery || createDelivery(env);
  const now = options.now || Date.now;
  const secure = origin.protocol === "https:";
  const bindingName = secure ? "__Host-shiyan_verify" : "shiyan_verify";
  const sessionName = secure ? "__Host-shiyan_session" : "shiyan_session";
  const signature = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  const cookie = (name: string, token: string, age: number) => `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? "; Secure" : ""}`;
  const channels = (preview = false) => (enabled || preview) && secret.length >= 32 ? (["email", "phone"] as const).filter(channel => delivery.available(channel)) : [];
  const ready = (preview = false) => channels(preview).length > 0;
  function binding(request: Request) {
    const values = (request.headers.get("cookie") || "").split(";").map(value => value.trim()).filter(value => value.startsWith(bindingName + "=")).map(value => value.slice(bindingName.length + 1));
    if (values.length !== 1 || !/^[a-f0-9]{64}$/.test(values[0])) throw new ApiError("登录页面已过期，请刷新页面后再试。", 403);
    return signature(`binding:${values[0]}`);
  }
  function bindingCookie(request: Request) {
    try { binding(request); return null; } catch { return cookie(bindingName, randomBytes(32).toString("hex"), 3600); }
  }
  function sameOrigin(request: Request) {
    if (request.headers.get("origin") !== origin.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError("请从本站提交。", 403);
  }
  async function limit(key: string, maximum: number, duration: number, message: string) {
    const time = now();
    const row = await db.prepare("INSERT INTO shiyan_auth_limits (key, window_start, attempts) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN window_start <= ? THEN 1 ELSE attempts + 1 END, window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END RETURNING attempts").bind(key, time, time - duration, time - duration).first<{ attempts: number }>();
    if (!row || row.attempts > maximum) throw new ApiError(message, 429);
  }
  async function send(request: Request, source: string, ownerId: string | null) {
    sameOrigin(request);
    if (!ready(ownerId === (env.APP_OWNER_ID || "shiyan-private-owner"))) throw new ApiError("验证码登录尚未开放，请稍后再来。", 503);
    const bindingHash = binding(request);
    const input = await body(request) as Record<string, unknown>;
    const { channel, address } = normalizeIdentity(input?.channel, input?.address);
    if (!delivery.available(channel)) throw new ApiError(channel === "phone" ? "短信登录尚未开放，请使用邮箱登录。" : "邮箱登录暂时不可用。", 503);
    // All counters are persistent atomic UPSERTs, shared across processes/restarts.
    const identityHash = signature(`${channel}:${address}`);
    await limit(`send-source:${signature(source)}`, 20, 15 * 60_000, "发送较频繁，请15分钟后再试。");
    await limit(`send-target:${identityHash}`, 8, 3600_000, "该账号接收较频繁，请一小时后再试。");
    await limit(`send-cooldown:${identityHash}`, 1, 60_000, "请60秒后再获取验证码。");
    const cap = Number(env.AUTH_DAILY_SEND_LIMIT || 200);
    await limit("send-global", Number.isInteger(cap) && cap > 0 ? cap : 200, 86400_000, "今日验证码发送已达上限，请明天再试。");
    const id = randomBytes(32).toString("hex");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const time = now();
    await db.batch([
      db.prepare("DELETE FROM shiyan_auth_challenges WHERE expires_at <= ?").bind(time),
      db.prepare("DELETE FROM shiyan_auth_limits WHERE window_start < ?").bind(time - 2 * 86400_000),
      db.prepare("INSERT INTO shiyan_auth_challenges (id, channel, address, identity_hash, binding_hash, owner_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, channel, address, identityHash, bindingHash, ownerId, signature(`code:${id}:${code}`), time, time + 300_000),
    ]);
    try {
      await delivery.send(channel, address, code, id);
      await db.prepare("UPDATE shiyan_auth_challenges SET ready = 1 WHERE id = ?").bind(id).run();
    } catch {
      await db.prepare("DELETE FROM shiyan_auth_challenges WHERE id = ?").bind(id).run();
      throw new ApiError("验证码发送失败，请稍后重试；仍未收到时可联系管理员。", 502);
    }
    return json({ challengeId: id, destination: maskIdentity(channel, address), expiresIn: 300, retryAfter: 60 });
  }
  async function verify(request: Request, source: string, ownerId: string | null) {
    sameOrigin(request);
    if (!ready(ownerId === (env.APP_OWNER_ID || "shiyan-private-owner"))) throw new ApiError("验证码登录尚未开放。", 503);
    const bindingHash = binding(request);
    const input = await body(request) as Record<string, unknown>;
    if (!/^[a-f0-9]{64}$/.test(String(input?.challengeId)) || !/^\d{6}$/.test(String(input?.code))) throw new ApiError("请填写6位数字验证码。");
    await limit(`verify-source:${signature(source)}`, 50, 15 * 60_000, "验证较频繁，请15分钟后再试。");
    const time = now();
    // Invalid guesses consume an attempt before comparing the digest. Concurrent
    // correct requests can only DELETE RETURNING this one-use challenge once.
    const challenge = await db.prepare("UPDATE shiyan_auth_challenges SET attempts = attempts + 1 WHERE id = ? AND binding_hash = ? AND owner_id IS ? AND ready = 1 AND expires_at > ? AND attempts < 5 RETURNING id, channel, address, owner_id, code_hash, attempts").bind(input.challengeId as string, bindingHash, ownerId, time).first<Challenge>();
    if (!challenge) throw new ApiError("验证码无效、已过期或尝试过多，请重新获取。", 401);
    await limit(`verify-target:${signature(`${challenge.channel}:${challenge.address}`)}`, 15, 15 * 60_000, "验证较频繁，请15分钟后再试。");
    const supplied = signature(`code:${challenge.id}:${input.code}`);
    if (!timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(challenge.code_hash, "hex"))) throw new ApiError("验证码不正确，请重新输入。", 401);
    const consumed = await db.prepare("DELETE FROM shiyan_auth_challenges WHERE id = ? AND code_hash = ? AND binding_hash = ? AND owner_id IS ? AND expires_at > ? RETURNING id").bind(challenge.id, challenge.code_hash, bindingHash, ownerId, now()).first();
    if (!consumed) throw new ApiError("验证码已使用，请重新获取。", 401);
    if (ownerId) {
      // Binding requires both the existing authenticated session and proof of the
      // new address. Never merge two users or let a registrant claim legacy data.
      const existing = await db.prepare("SELECT user_id FROM shiyan_identities WHERE channel = ? AND address = ?").bind(challenge.channel, challenge.address).first<{ user_id: string }>();
      if (existing && existing.user_id !== ownerId) throw new ApiError("该手机号或邮箱已用于其他账号，请使用原账号登录。", 409);
      const sameChannel = await db.prepare("SELECT address FROM shiyan_identities WHERE user_id = ? AND channel = ?").bind(ownerId, challenge.channel).first<{ address: string }>();
      if (sameChannel && sameChannel.address !== challenge.address) throw new ApiError("此登录方式已绑定。为保护账号，当前版本不支持直接更换。", 409);
      try {
        await db.batch([
          db.prepare("INSERT INTO shiyan_users (id, display_name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(ownerId, "我的空间", time),
          db.prepare("INSERT INTO shiyan_identities (channel, address, user_id, verified_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(challenge.channel, challenge.address, ownerId, time),
        ]);
      } catch { throw new ApiError("绑定未完成，请重新获取验证码后再试。", 409); }
      const linked = await db.prepare("SELECT user_id FROM shiyan_identities WHERE channel = ? AND address = ?").bind(challenge.channel, challenge.address).first<{ user_id: string }>();
      if (linked?.user_id !== ownerId) throw new ApiError("该登录方式已绑定其他账号。", 409);
      return json({ ok: true, message: "绑定成功，下次可使用此方式登录同一空间。" });
    }
    const userId = randomUUID();
    const token = randomBytes(32).toString("hex");
    await db.batch([
      db.prepare("DELETE FROM shiyan_sessions WHERE expires_at <= ?").bind(time),
      db.prepare("INSERT INTO shiyan_users (id, display_name, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM shiyan_identities WHERE channel = ? AND address = ?)").bind(userId, "我的空间", time, challenge.channel, challenge.address),
      db.prepare("INSERT INTO shiyan_identities (channel, address, user_id, verified_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM shiyan_users WHERE id = ?) ON CONFLICT(channel, address) DO NOTHING").bind(challenge.channel, challenge.address, userId, time, userId),
      db.prepare("INSERT INTO shiyan_sessions (token_hash, owner_id, expires_at) SELECT ?, user_id, ? FROM shiyan_identities WHERE channel = ? AND address = ?").bind(sha256(token), time + 8 * 3600_000, challenge.channel, challenge.address),
    ]);
    const response = json({ ok: true, location: "/" });
    response.headers.set("Set-Cookie", cookie(sessionName, token, 8 * 3600));
    return response;
  }
  async function profile(ownerId: string) {
    const identities = (await db.prepare("SELECT channel, address FROM shiyan_identities WHERE user_id = ? ORDER BY channel").bind(ownerId).all<Identity>()).results;
    return { identities: identities.map(identity => ({ channel: identity.channel, address: maskIdentity(identity.channel, identity.address) })) };
  }
  return { enabled, channels, ready, bindingCookie, send, verify, profile };
}
