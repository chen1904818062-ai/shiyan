import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { openDatabase, migrate } from "../standalone/database.ts";
import { createAccounts, normalizeIdentity } from "../standalone/accounts.ts";
import { createDelivery } from "../standalone/verification-delivery.ts";

await mkdir(".sites-runtime", { recursive: true });
const directory = await mkdtemp(resolve(".sites-runtime/accounts-test-"));
const secret = "accounts-test-only-secret-32-characters";
let sequence = 0;
async function fixture(base = "https://shiyan.example", extraEnv = {}) {
  const url = pathToFileURL(join(directory, `${++sequence}.sqlite`)).href;
  const { client, db } = openDatabase({ ALLOW_LOCAL_DB: "true", TURSO_DATABASE_URL: url });
  await migrate(client, [resolve("drizzle"), resolve("standalone/migrations")]);
  let time = Date.now();
  const deliveries = new Map();
  let fail = false;
  const delivery = { available: () => true, send: async (channel, address, code, id) => { if (fail) throw new Error("private-provider-credential-must-not-leak"); deliveries.set(id, { channel, address, code }); } };
  const accounts = createAccounts(db, new URL(base), { env: { APP_PUBLIC_SIGNUP: "true", APP_AUTH_SECRET: secret, ...extraEnv }, delivery, now: () => time });
  const request = (path, data, cookie, origin = base) => new Request(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(data) });
  const cookie = () => accounts.bindingCookie(new Request(base + "/login")).split(";")[0];
  async function send(channel, address, binding = cookie(), ownerId = null) {
    const response = await accounts.send(request("/send", { channel, address }, binding), "source-test", ownerId);
    const value = await response.json();
    return { ...value, binding, code: deliveries.get(value.challengeId).code };
  }
  async function verify(challenge, ownerId = null, overrides = {}) {
    return accounts.verify(request("/verify", { challengeId: challenge.challengeId, code: challenge.code, ...overrides }, challenge.binding), "source-test", ownerId);
  }
  return { accounts, client, db, url, deliveries, request, cookie, send, verify, advance: ms => { time += ms; }, fail: value => { fail = value; } };
}
function status(code) { return error => error.status === code; }
function sessionCookie(response) { return response.headers.get("set-cookie").split(";")[0]; }
async function owner(db, response) {
  const token = sessionCookie(response).split("=")[1];
  const hash = createHash("sha256").update(token).digest("hex");
  return (await db.prepare("SELECT owner_id FROM shiyan_sessions WHERE token_hash = ?").bind(hash).first()).owner_id;
}

test("normalize mainland phone and email, reject malformed or foreign addresses", () => {
  assert.deepEqual(normalizeIdentity("phone", "+86 138-0013-8000"), { channel: "phone", address: "+8613800138000" });
  assert.deepEqual(normalizeIdentity("email", " Person@Example.com "), { channel: "email", address: "person@example.com" });
  for (const [channel, value] of [["phone", "+14155550123"], ["phone", "abc13800138000"], ["email", "a@example.com\r\nBcc:x@example.com"], ["email", "missing-domain"], ["other", "x"]]) assert.throws(() => normalizeIdentity(channel, value));
});

test("OTP creates independent users, keeps returning identities and links phone to same space", async () => {
  const f = await fixture();
  try {
    const a = await f.send("email", "a@example.com");
    assert.equal(a.expiresIn, 300); assert.match(a.code, /^\d{6}$/);
    const stored = await f.db.prepare("SELECT code_hash FROM shiyan_auth_challenges WHERE id = ?").bind(a.challengeId).first();
    assert.notEqual(stored.code_hash, a.code); assert.equal(stored.code_hash.length, 64);
    const responseA = await f.verify(a);
    assert.match(responseA.headers.get("set-cookie"), /^__Host-shiyan_session=.*HttpOnly.*SameSite=Lax.*Secure/);
    const idA = await owner(f.db, responseA);
    assert.notEqual(idA, "shiyan-private-owner");
    const b = await f.send("email", "b@example.com");
    const idB = await owner(f.db, await f.verify(b)); assert.notEqual(idA, idB);
    const phone = await f.send("phone", "13800138000", undefined, idA);
    assert.equal((await f.verify(phone, idA)).status, 200);
    f.advance(61_000);
    const phoneLogin = await f.send("phone", "+8613800138000");
    assert.equal(await owner(f.db, await f.verify(phoneLogin)), idA);
    const emailLogin = await f.send("email", "A@EXAMPLE.COM");
    assert.equal(await owner(f.db, await f.verify(emailLogin)), idA);
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS count FROM shiyan_users").first()).count, 2);
    assert.equal((await f.accounts.profile(idA)).identities.length, 2);
    f.advance(61_000);
    const steal = await f.send("phone", "13800138000", undefined, idB);
    await assert.rejects(() => f.verify(steal, idB), status(409));
  } finally { f.client.close(); }
});

test("challenge binds to browser, purpose, origin and expiry; concurrent replay only succeeds once", async () => {
  const f = await fixture();
  try {
    const challenge = await f.send("email", "one@example.com");
    await assert.rejects(() => f.verify({ ...challenge, binding: f.cookie() }), status(401));
    await assert.rejects(() => f.verify(challenge, "another-user"), status(401));
    await assert.rejects(() => f.accounts.verify(f.request("/verify", { challengeId: challenge.challengeId, code: challenge.code }, challenge.binding, "https://evil.example"), "source", null), status(403));
    const results = await Promise.allSettled([f.verify(challenge), f.verify(challenge)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    await assert.rejects(() => f.verify(challenge), status(401));
    const expired = await f.send("email", "expired@example.com"); f.advance(300_001);
    await assert.rejects(() => f.verify(expired), status(401));
  } finally { f.client.close(); }
});

test("guess limit, persistent send cooldown and failed deliveries never yield a session", async () => {
  const f = await fixture();
  try {
    const challenge = await f.send("email", "limit@example.com");
    const wrong = challenge.code === "000000" ? "111111" : "000000";
    for (let n = 0; n < 5; n++) await assert.rejects(() => f.verify(challenge, null, { code: wrong }), status(401));
    await assert.rejects(() => f.verify(challenge), status(401));
    await assert.rejects(() => f.send("email", "limit@example.com"), status(429));
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS count FROM shiyan_sessions").first()).count, 0);
    f.fail(true);
    await assert.rejects(() => f.send("email", "failure@example.com"), error => error.status === 502 && !error.message.includes("private-provider"));
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS count FROM shiyan_auth_challenges WHERE address = ?").bind("failure@example.com").first()).count, 0);
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS count FROM shiyan_users").first()).count, 0);
  } finally { f.client.close(); }
});

test("original owner verifies an identity without assigning existing data to first registrant", async () => {
  const f = await fixture("https://shiyan.example", { APP_PUBLIC_SIGNUP: "false" });
  try {
    assert.deepEqual(f.accounts.channels(), []); assert.equal(f.accounts.channels(true).length, 2);
    await assert.rejects(() => f.send("email", "public@example.com"), status(503));
    const claim = await f.send("email", "owner@example.com", undefined, "shiyan-private-owner");
    await f.verify(claim, "shiyan-private-owner");
    assert.equal((await f.db.prepare("SELECT user_id FROM shiyan_identities WHERE address = ?").bind("owner@example.com").first()).user_id, "shiyan-private-owner");
  } finally { f.client.close(); }
  assert.throws(() => createAccounts({}, new URL("https://shiyan.example"), { env: { APP_PUBLIC_SIGNUP: "true" } }), /APP_AUTH_SECRET/);
});

test("delivery uses Resend and signed Tencent SMS, requires provider success and never follows redirects", async () => {
  const calls = [];
  const env = { RESEND_API_KEY: "test-email-key", AUTH_EMAIL_FROM: "拾言 <login@example.com>", TENCENT_SMS_SECRET_ID: "test-id", TENCENT_SMS_SECRET_KEY: "test-secret", TENCENT_SMS_APP_ID: "test-app", TENCENT_SMS_SIGN_NAME: "拾言", TENCENT_SMS_TEMPLATE_ID: "test-template" };
  const transport = async (url, init) => { calls.push({ url, init }); return Response.json(url.includes("resend") ? { id: "accepted" } : { Response: { SendStatusSet: [{ Code: "Ok" }] } }); };
  const delivery = createDelivery(env, transport);
  await delivery.send("email", "a@example.com", "012345", "challenge");
  await delivery.send("phone", "+8613800138000", "012345", "challenge");
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(JSON.parse(calls[0].init.body).to[0], "a@example.com");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "shiyan-verify-challenge");
  assert.equal(calls[1].url, "https://sms.tencentcloudapi.com");
  assert.equal(calls[1].init.redirect, "error");
  const init = calls[1].init;
  const date = new Date(Number(init.headers["X-TC-Timestamp"]) * 1000).toISOString().slice(0, 10);
  const hash = text => createHash("sha256").update(text).digest("hex");
  const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
  const canonical = ["POST", "/", "", "content-type:application/json; charset=utf-8\nhost:sms.tencentcloudapi.com\n", "content-type;host", hash(init.body)].join("\n");
  const key = hmac(hmac(hmac("TC3test-secret", date), "sms"), "tc3_request");
  const expected = createHmac("sha256", key).update(["TC3-HMAC-SHA256", init.headers["X-TC-Timestamp"], `${date}/sms/tc3_request`, hash(canonical)].join("\n")).digest("hex");
  assert.ok(init.headers.Authorization.endsWith(`Signature=${expected}`));
  const bad = createDelivery(env, async () => Response.json({ Response: { SendStatusSet: [{ Code: "FailedOperation" }] } }));
  await assert.rejects(() => bad.send("phone", "+8613800138000", "012345", "bad"));
  assert.equal(createDelivery({}).available("email"), false);
});

test("two real sessions cannot read or modify each other's topics, originals or reports, or borrow owner model key", async () => {
  const base = "http://127.0.0.1:18891";
  const f = await fixture(base);
  let handle;
  try {
    const cookieA = sessionCookie(await f.verify(await f.send("email", "alice@example.com")));
    const cookieB = sessionCookie(await f.verify(await f.send("email", "bob@example.com")));
    handle = spawn(process.execPath, ["standalone-dist/server.mjs"], { env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: "18891", APP_BASE_URL: base, ALLOW_LOCAL_DB: "true", TURSO_DATABASE_URL: f.url, APP_ACCESS_PASSWORD: "test-only-old-space-password", APP_AUTH_SECRET: secret, APP_PUBLIC_SIGNUP: "true", RESEND_API_KEY: "test-only-not-used", AUTH_EMAIL_FROM: "login@example.com", MODEL_API_KEY: "server-key-must-not-be-shared" }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((ready, reject) => { const timer = setTimeout(() => reject(new Error("Startup timed out")), 15_000); handle.stdout.on("data", data => { if (String(data).includes("listening")) { clearTimeout(timer); ready(); } }); handle.once("exit", code => { clearTimeout(timer); reject(new Error(`Server exit ${code}`)); }); });
    const request = (path, cookie = cookieA, data, method = data ? "POST" : "GET") => fetch(base + path, { method, headers: { Cookie: cookie, Origin: base, ...(data ? { "Content-Type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}), redirect: "manual" });
    const login = await fetch(base + "/login"); assert.match(await login.text(), /auth-root/);
    const config = await (await fetch(base + "/api/auth/config")).json(); assert.deepEqual(config.channels, ["email"]);
    const a = (await (await request("/api/topics", cookieA, { title: "Alice 私有求职" })).json()).topic.id;
    const b = (await (await request("/api/topics", cookieB, { title: "Bob 的话题" })).json()).topic.id;
    const original = (await (await request(`/api/topics/${a}/conversations`, cookieA, { title: "简历原文", source: "ChatGPT", content: "用户：秘密求职经历。AI：先按成果整理。" })).json()).id;
    const now = new Date().toISOString();
    await f.db.prepare("INSERT INTO reports (id, topic_id, kind, summary_json, source_ids_json, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("private-report", a, "topic", JSON.stringify({ overview: "Alice 私人报告" }), JSON.stringify([original]), "test", now).run();
    const listB = await (await request("/api/topics", cookieB)).json(); assert.deepEqual(listB.topics.map(topic => topic.id), [b]);
    for (const [path, data, method] of [[`/api/topics/${a}`, undefined, "GET"], [`/api/topics/${a}`, undefined, "DELETE"], [`/api/topics/${a}/conversations`, { title: "越权写入", source: "豆包", content: "不能添加" }, "POST"], [`/api/topics/${a}/summarize`, {}, "POST"], [`/api/conversations/${original}`, undefined, "DELETE"]]) assert.equal((await request(path, cookieB, data, method)).status, 404, path);
    const intact = await (await request(`/api/topics/${a}`)).json(); assert.equal(intact.conversations.length, 1); assert.equal(intact.reports.length, 1); assert.equal(intact.reports[0].summary.overview, "Alice 私人报告");
    assert.equal((await (await request("/api/model", cookieB)).json()).configured, false);
    assert.equal((await request(`/api/topics/${a}/summarize`, cookieA, {})).status, 422);
    const profile = await (await request("/api/account/config", cookieB)).json(); assert.equal(profile.owner, false); assert.equal(profile.setup, undefined); assert.equal(profile.identities[0].address, "bo***@example.com");
    assert.equal((await fetch(base + "/api/topics", { headers: { "x-chatgpt-user-id": "shiyan-private-owner" } })).status, 401);
    assert.equal((await request("/api/topics", "", { title: "unauthorized" })).status, 401);
  } finally {
    if (handle && handle.exitCode === null) { const ended = new Promise(resolve => handle.once("exit", resolve)); handle.kill(); await ended; }
    f.client.close();
  }
});
