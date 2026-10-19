import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openDatabase, migrate } from "../standalone/database.ts";

await mkdir(".sites-runtime", { recursive: true });
const directory = await mkdtemp(resolve(".sites-runtime", "standalone-test-"));

test("SQL adapter preserves atomic batches, changes counts and migration history", async () => {
  const { client, db } = openDatabase({ TURSO_DATABASE_URL: pathToFileURL(join(directory, "adapter.sqlite")).href, ALLOW_LOCAL_DB: "true" });
  try {
    await migrate(client, [resolve("drizzle"), resolve("standalone/migrations")]);
    await migrate(client, [resolve("drizzle"), resolve("standalone/migrations")]);
    const insert = db.prepare("INSERT INTO topics (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind("one", "owner", "话题", "2026", "2026");
    assert.equal((await insert.run()).meta.changes, 1);
    assert.equal((await db.prepare("SELECT title FROM topics WHERE id = ?").bind("one").first("title")), "话题");
    await assert.rejects(() => db.batch([
      db.prepare("INSERT INTO topics (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind("two", "owner", "必须回滚", "2026", "2026"),
      insert,
    ]));
    assert.equal(await db.prepare("SELECT id FROM topics WHERE id = ?").bind("two").first(), null);
    assert.equal((await db.prepare("SELECT name FROM shiyan_migrations").all()).results.length, 3);
  } finally { client.close(); }
});

test("standalone server protects private data, persists originals and survives restart", async () => {
  const port = 18787;
  const base = `http://127.0.0.1:${port}`;
  const password = "standalone-local-test-only-password";
  const databaseURL = pathToFileURL(join(directory, "server.sqlite")).href;
  let processHandle;
  async function start() {
    processHandle = spawn(process.execPath, ["standalone-dist/server.mjs"], { env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: String(port), APP_BASE_URL: base, APP_ACCESS_PASSWORD: password, TURSO_DATABASE_URL: databaseURL, ALLOW_LOCAL_DB: "true", TURSO_AUTH_TOKEN: "", MODEL_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolveReady, reject) => {
      let text = "";
      const timer = setTimeout(() => reject(new Error("Standalone startup timed out")), 15_000);
      processHandle.stdout.on("data", data => { text += data; if (text.includes("listening")) { clearTimeout(timer); resolveReady(); } });
      processHandle.once("exit", code => { clearTimeout(timer); reject(new Error(`Standalone exited: ${code}`)); });
    });
  }
  async function stop() {
    if (!processHandle || processHandle.exitCode !== null) return;
    const ended = new Promise(resolveExit => processHandle.once("exit", resolveExit));
    processHandle.kill("SIGTERM"); await ended;
  }
  await start();
  try {
    const health = await fetch(base + "/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", application: "shiyan", version: "1.1.0" });
    assert.equal((await fetch(base + "/api/topics")).status, 401);
    assert.equal((await fetch(base + "/api/topics", { headers: { "oai-authenticated-user-id": "shiyan-private-owner", "oai-authenticated-user-email": "fake@test.invalid" } })).status, 401);
    assert.equal((await fetch(base + "/", { redirect: "manual" })).headers.get("location"), "/login");
    const submit = (value, origin = base) => fetch(base + "/login", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin }, body: new URLSearchParams({ password: value }) });
    assert.equal((await submit("wrong-password")).status, 401);
    assert.equal((await submit(password, "https://attacker.invalid")).status, 403);
    const login = await submit(password);
    assert.equal(login.status, 303);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
    const authCookie = cookie.split(";")[0];
    const request = (path, value, method) => fetch(base + path, { method: method || (value ? "POST" : "GET"), headers: { Cookie: authCookie, "Content-Type": "application/json", Origin: base }, ...(value ? { body: JSON.stringify(value) } : {}) });
    assert.equal((await request("/api/session")).status, 200);
    const created = await request("/api/topics", { title: "海外部署验收", description: "数据迁移" });
    assert.equal(created.status, 201);
    const topicId = (await created.json()).topic.id;
    const original = "\n用户：我想整理求职资料。\nAI：可以先整理简历和面试准备。\n ";
    const conversation = { title: "简历准备", source: "豆包", content: original };
    assert.equal((await request(`/api/topics/${topicId}/conversations`, conversation)).status, 201);
    assert.equal((await request(`/api/topics/${topicId}/conversations`, conversation)).status, 409);
    assert.equal((await (await request(`/api/topics/${topicId}`)).json()).conversations[0].content, original);
    assert.equal((await request(`/api/topics/${topicId}/summarize`, { provider: "glm" })).status, 422);
    const script = await (await fetch(base + "/assets/app.js")).text();
    assert.ok(!script.includes(password)); assert.ok(!script.includes("TURSO_AUTH_TOKEN"));
    await stop(); await start();
    assert.equal((await (await request(`/api/topics/${topicId}`)).json()).conversations[0].content, original);
    assert.equal((await request(`/api/topics/${topicId}`, null, "DELETE")).status, 200);
    assert.equal((await request(`/api/topics/${topicId}`)).status, 404);
    const logout = await fetch(base + "/signout-with-chatgpt", { headers: { Cookie: authCookie }, redirect: "manual" });
    assert.equal(logout.status, 303);
    assert.equal((await request("/api/topics")).status, 401);
  } finally { await stop(); }
});

test("migration backup restores into an empty database and refuses overwriting existing data", async () => {
  const backup = join(directory, "backup.json");
  const sourceEnv = { ...process.env, ALLOW_LOCAL_DB: "true", TURSO_DATABASE_URL: pathToFileURL(join(directory, "adapter.sqlite")).href };
  const source = openDatabase(sourceEnv);
  await source.db.prepare("INSERT INTO shiyan_users (id, display_name, created_at) VALUES (?, ?, ?)").bind("owner", "测试空间", 123).run();
  await source.db.prepare("INSERT INTO shiyan_identities (channel, address, user_id, verified_at) VALUES (?, ?, ?, ?)").bind("email", "backup@example.com", "owner", 123).run();
  source.client.close();
  const exported = spawnSync(process.execPath, ["scripts/transfer-data.mjs", "export", backup], { env: sourceEnv, encoding: "utf8" });
  assert.equal(exported.status, 0, exported.stderr);
  const targetEnv = { ...sourceEnv, TURSO_DATABASE_URL: pathToFileURL(join(directory, "restored.sqlite")).href };
  const imported = spawnSync(process.execPath, ["scripts/transfer-data.mjs", "import", backup], { env: targetEnv, encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  const { db, client } = openDatabase(targetEnv);
  assert.equal((await db.prepare("SELECT title FROM topics WHERE id = ?").bind("one").first()).title, "话题");
  assert.equal((await db.prepare("SELECT user_id FROM shiyan_identities WHERE address = ?").bind("backup@example.com").first()).user_id, "owner");
  assert.equal((await db.prepare("SELECT created_at FROM shiyan_users WHERE id = ?").bind("owner").first()).created_at, 123);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM shiyan_sessions").first()).count, 0);
  client.close();
  const rejected = spawnSync(process.execPath, ["scripts/transfer-data.mjs", "import", backup], { env: targetEnv, encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /not empty/);
});
