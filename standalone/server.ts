import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, migrate } from "./database.ts";
import { setDatabase, requests } from "./server-context.ts";
import { createAuth } from "./auth.ts";
import { loginPage, accountPage } from "./pages.ts";
import { createAccounts } from "./accounts.ts";
import { assetEncoding } from "./assets.ts";
import { ApiError, json } from "../lib/http-common.ts";
import * as topics from "../app/api/topics/route.ts";
import * as topic from "../app/api/topics/[id]/route.ts";
import * as conversations from "../app/api/topics/[id]/conversations/route.ts";
import * as conversation from "../app/api/conversations/[id]/route.ts";
import * as summarize from "../app/api/topics/[id]/summarize/route.ts";
import * as model from "../app/api/model/route.ts";
import * as modelCatalog from "../app/api/model/models/route.ts";
import { APP_VERSION } from "../lib/version.ts";

const directory = dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 10000);
const origin = new URL(process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${port}`);
if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") throw new Error("APP_BASE_URL or RENDER_EXTERNAL_URL must specify the public HTTPS origin");
const { client, db } = openDatabase();
await migrate(client, [join(directory, "migrations/app"), join(directory, "migrations/auth")]);
setDatabase(db);
const auth = await createAuth(db, process.env.APP_ACCESS_PASSWORD || "", origin);
const accounts = createAccounts(db, origin);
function accountHTML(request: Request, account = false, config = { channels: accounts.channels() }) {
  const response = html(accountPage(account, config));
  const cookie = accounts.bindingCookie(request);
  if (cookie) response.headers.set("Set-Cookie", cookie);
  return response;
}
async function accountConfig(ownerId: string) {
  const owner = ownerId === (process.env.APP_OWNER_ID || "shiyan-private-owner");
  const fields = ["APP_AUTH_SECRET", "RESEND_API_KEY", "AUTH_EMAIL_FROM", "TENCENT_SMS_SECRET_ID", "TENCENT_SMS_SECRET_KEY", "TENCENT_SMS_APP_ID", "TENCENT_SMS_SIGN_NAME", "TENCENT_SMS_TEMPLATE_ID"];
  return { ...(await accounts.profile(ownerId)), channels: accounts.channels(owner), owner, ...(owner ? { publicEnabled: accounts.enabled, setup: fields.map(name => ({ name, configured: name === "APP_AUTH_SECRET" ? (process.env[name]?.length || 0) >= 32 : !!process.env[name]?.trim() })) } : {}) };
}

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of request) { length += chunk.length; if (length > 600_000) throw new ApiError("提交的内容过长，请分次添加。", 413); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
function html(content: string, status = 200) { return new Response(content, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }); }
function redirect(location: string) { return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } }); }

async function route(request: Request, address: string): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (request.method === "GET" && pathname === "/healthz") { await client.execute("SELECT 1"); return json({ status: "ok", application: "shiyan", version: APP_VERSION }); }
  if (request.method === "GET" && ["/login", "/register", "/signin-with-chatgpt"].includes(pathname)) return await auth.user(request) ? redirect("/") : accounts.enabled ? accountHTML(request) : html(loginPage());
  if (request.method === "GET" && pathname === "/owner/login") return await auth.user(request) ? redirect("/account") : html(loginPage("", "/owner/login"));
  if ((pathname === "/login" || pathname === "/owner/login") && request.method === "POST") {
    if (accounts.enabled && pathname === "/login") throw new ApiError("请使用验证码登录。", 403);
    try { return await auth.login(request, address); }
    catch (error) { if (error instanceof ApiError) return html(loginPage(error.message, pathname), error.status); throw error; }
  }
  if (pathname === "/api/auth/config" && request.method === "GET") {
    const response = json({ channels: accounts.channels() });
    const cookie = accounts.bindingCookie(request);
    if (cookie) response.headers.set("Set-Cookie", cookie);
    return response;
  }
  if (pathname === "/api/auth/send" && request.method === "POST") return accounts.send(request, address, null);
  if (pathname === "/api/auth/verify" && request.method === "POST") return accounts.verify(request, address, null);
  if ((pathname === "/signout-with-chatgpt" || pathname === "/logout") && (request.method === "GET" || request.method === "POST")) return auth.logout(request);
  // A fixed asset allowlist prevents traversal and never serves source or secrets.
  const assets: Record<string, [string, string]> = {
    "/assets/app.js": ["assets/app.js", "text/javascript; charset=utf-8"],
    "/assets/app.css": ["assets/app.css", "text/css; charset=utf-8"],
    "/assets/auth.js": ["assets/auth.js", "text/javascript; charset=utf-8"],
    "/assets/auth.css": ["assets/auth.css", "text/css; charset=utf-8"],
    "/favicon.svg": ["favicon.svg", "image/svg+xml"],
  };
  if (request.method === "GET" && Object.hasOwn(assets, pathname)) {
    const [file, type] = assets[pathname];
    const encoding = /\.(js|css)$/.test(file) ? assetEncoding(request.headers.get("accept-encoding") || "") : undefined;
    const content = await readFile(join(directory, "public", file + (encoding === "br" ? ".br" : encoding === "gzip" ? ".gz" : "")));
    return new Response(content, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=300", Vary: "Accept-Encoding", "Content-Length": String(content.byteLength), ...(encoding ? { "Content-Encoding": encoding } : {}) } });
  }
  const user = await auth.user(request);
  if (!user) return pathname.startsWith("/api/") ? json({ error: "请先登录后使用。" }, 401) : redirect("/login");
  if (!["GET", "HEAD"].includes(request.method)) auth.sameOrigin(request);
  return requests.run(user, async () => {
    if (pathname === "/api/session" && request.method === "GET") return json({ displayName: user.ownerId === (process.env.APP_OWNER_ID || "shiyan-private-owner") ? process.env.APP_DISPLAY_NAME || "我的空间" : "我的空间", accountEnabled: true });
    if (pathname === "/account" && request.method === "GET") return accountHTML(request, true, await accountConfig(user.ownerId));
    if (pathname === "/api/account/config" && request.method === "GET") {
      return json(await accountConfig(user.ownerId));
    }
    if (pathname === "/api/account/send" && request.method === "POST") return accounts.send(request, address, user.ownerId);
    if (pathname === "/api/account/verify" && request.method === "POST") return accounts.verify(request, address, user.ownerId);
    if (pathname === "/" && request.method === "GET") return html(await readFile(join(directory, "public/index.html"), "utf8"));
    if (pathname === "/api/model" && request.method === "GET") return model.GET();
    if (pathname === "/api/model/models" && request.method === "POST") return modelCatalog.POST(request);
    if (pathname === "/api/topics" && request.method === "GET") return topics.GET();
    if (pathname === "/api/topics" && request.method === "POST") return topics.POST(request);
    let match = /^\/api\/topics\/([a-zA-Z0-9-]+)$/.exec(pathname);
    if (match) {
      const params = { params: Promise.resolve({ id: match[1] }) };
      if (request.method === "GET") return topic.GET(request, params);
      if (request.method === "DELETE") return topic.DELETE(request, params);
    }
    match = /^\/api\/topics\/([a-zA-Z0-9-]+)\/(conversations|summarize)$/.exec(pathname);
    if (match && request.method === "POST") {
      const params = { params: Promise.resolve({ id: match[1] }) };
      return match[2] === "conversations" ? conversations.POST(request, params) : summarize.POST(request, params);
    }
    match = /^\/api\/conversations\/([a-zA-Z0-9-]+)$/.exec(pathname);
    if (match && request.method === "DELETE") return conversation.DELETE(request, { params: Promise.resolve({ id: match[1] }) });
    return json({ error: "没有找到这个页面。" }, 404);
  });
}

async function respond(response: ServerResponse, result: Response) {
  response.writeHead(result.status, {
    ...Object.fromEntries(result.headers),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  response.end(Buffer.from(await result.arrayBuffer()));
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    const method = incoming.method || "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : await requestBody(incoming);
    const request = new Request(new URL(incoming.url || "/", origin), { method, headers, ...(body ? { body } : {}) });
    await respond(outgoing, await route(request, incoming.socket.remoteAddress || "unknown"));
  } catch (error) {
    await respond(outgoing, error instanceof ApiError ? json({ error: error.message }, error.status) : error instanceof SyntaxError ? json({ error: "提交的内容格式不正确。" }, 400) : json({ error: "服务暂时不可用，请稍后重试。" }, 503));
  }
});
server.requestTimeout = 180_000;
server.headersTimeout = 15_000;
server.listen(port, host, () => console.log(`Shiyan ${APP_VERSION} listening on ${host}:${port}`));
let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => { client.close(); process.exit(0); });
  setTimeout(() => { server.closeAllConnections(); client.close(); process.exit(0); }, 25_000).unref();
});
