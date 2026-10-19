import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import http from "node:http";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
await mkdir(".sites-runtime/screenshots", { recursive: true });
const directory = await mkdtemp(resolve(".sites-runtime", "login-experience-"));
const base = "http://127.0.0.1:18893";
const env = { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: "18893", APP_BASE_URL: base, ALLOW_LOCAL_DB: "true", TURSO_DATABASE_URL: pathToFileURL(join(directory, "db.sqlite")).href, APP_PUBLIC_SIGNUP: "true", APP_AUTH_SECRET: "test-only-browser-32-character-secret", APP_ACCESS_PASSWORD: "test-only-owner-access-password", RESEND_API_KEY: "test-only", AUTH_EMAIL_FROM: "login@example.com", TENCENT_SMS_SECRET_ID: "test-only", TENCENT_SMS_SECRET_KEY: "test-only", TENCENT_SMS_APP_ID: "test-only", TENCENT_SMS_SIGN_NAME: "test-only", TENCENT_SMS_TEMPLATE_ID: "test-only", MODEL_API_KEY: "" };
const server = spawn(process.execPath, ["--import", "./tests/fixtures/verification-upstream.mjs", "standalone-dist/server.mjs"], { env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
const deliveries = new Map(); server.on("message", value => deliveries.set(value.address, value.code));
const errors = []; let browser; let passed = 0;
const check = label => { passed++; console.log("PASS " + label); };
const delay = ms => new Promise(done => setTimeout(done, ms));
async function received(address) { for (let n = 0; n < 100 && !deliveries.has(address); n++) await delay(20); assert.ok(deliveries.has(address)); return deliveries.get(address); }
function wire(path, accept) {
  return new Promise((done, fail) => { http.get(base + path, { headers: { "Accept-Encoding": accept } }, response => { const parts = []; response.on("data", part => parts.push(part)); response.on("end", () => done({ status: response.statusCode, headers: response.headers, body: Buffer.concat(parts) })); response.on("error", fail); }).on("error", fail); });
}
try {
  await new Promise((ready, fail) => { const timer = setTimeout(() => fail(new Error("Server startup timeout")), 15_000); server.stdout.on("data", value => { if (String(value).includes("listening")) { clearTimeout(timer); ready(); } }); server.once("exit", code => { clearTimeout(timer); fail(new Error("Server exited " + code)); }); });
  const html = await (await fetch(base + "/login")).text();
  assert.match(html, /aria-label="邮箱地址"/); assert.match(html, /assets\/auth.css\?v=1.1.1/); assert.ok(!html.includes("正在读取登录方式")); assert.ok(!html.includes("test-only"));
  const raw = await wire("/assets/auth.js?v=1.1.1", "identity");
  const br = await wire("/assets/auth.js?v=1.1.1", "br, gzip");
  const gz = await wire("/assets/auth.js?v=1.1.1", "br;q=0, gzip;q=1");
  const plain = await wire("/assets/auth.js", "br;q=0,gzip;q=0");
  assert.equal(br.headers["content-encoding"], "br"); assert.equal(gz.headers["content-encoding"], "gzip"); assert.equal(plain.headers["content-encoding"], undefined);
  assert.deepEqual(brotliDecompressSync(br.body), raw.body); assert.deepEqual(gunzipSync(gz.body), raw.body); assert.equal(br.headers.vary, "Accept-Encoding");
  assert.ok(br.body.length < raw.body.length * .4);
  check("the form is in initial HTML; precompressed scripts decode correctly and honor disabled encodings");

  browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  let releaseScript; const scriptGate = new Promise(done => { releaseScript = done; });
  await page.route("**/assets/auth.js?*", async route => { await scriptGate; await route.continue(); });
  let configRequests = 0; let sendRequests = 0; let verifyRequests = 0;
  page.on("request", request => { if (request.url().endsWith("/api/auth/config")) configRequests++; if (request.url().endsWith("/api/auth/verify")) verifyRequests++; });
  await page.goto(base + "/login", { waitUntil: "commit" });
  await page.getByLabel("邮箱地址", { exact: true }).fill("early@example.com");
  await page.getByLabel("邮箱地址", { exact: true }).press("Enter");
  assert.equal(page.url(), base + "/login"); assert.equal(await page.getByRole("button", { name: "获取验证码", exact: true }).isDisabled(), true);
  releaseScript(); await page.waitForLoadState("load"); await page.waitForFunction(() => !document.querySelector("button[type=submit]").disabled);
  assert.equal(await page.getByLabel("邮箱地址", { exact: true }).inputValue(), "early@example.com"); assert.equal(configRequests, 0);
  check("typing before scripts load survives hydration without another config request or accidental form navigation");
  await page.screenshot({ path: ".sites-runtime/screenshots/login-smooth-desktop.png", fullPage: true });

  let releaseSend; const sendGate = new Promise(done => { releaseSend = done; });
  await page.route("**/api/auth/send", async route => { sendRequests++; if (sendRequests === 1) { await route.abort("failed"); return; } await sendGate; await route.continue(); });
  await page.getByLabel("邮箱地址", { exact: true }).press("Enter");
  await page.getByRole("alert").filter({ hasText: "网络暂时不稳定" }).waitFor();
  assert.equal(await page.getByLabel("邮箱地址", { exact: true }).inputValue(), "early@example.com");
  await page.getByLabel("邮箱地址", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "正在发送…", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "正在发送…", exact: true }).isDisabled(), true);
  await page.getByLabel("邮箱地址", { exact: true }).press("Enter");
  assert.equal(sendRequests, 2); assert.equal(verifyRequests, 0);
  const before = await page.locator(".auth-card").boundingBox(); releaseSend();
  const code = await received("early@example.com"); await page.getByLabel("验证码", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("验证码", { exact: true }).evaluate(node => node === document.activeElement), true);
  const after = await page.locator(".auth-card").boundingBox();
  console.log(JSON.stringify({ cardHeightChange: Math.round(after.height - before.height) }));
  assert.ok(Math.abs(after.height - before.height) <= 4, "Changing steps should keep the card stable");
  check("Enter sends the code, offline failures preserve the address, and pending submissions cannot send twice");

  await page.getByLabel("验证码", { exact: true }).fill("12");
  await page.getByRole("button", { name: "手机验证码", exact: true }).click(); await page.getByLabel("手机号", { exact: true }).fill("13900139000");
  await page.getByRole("button", { name: "邮箱验证码", exact: true }).click();
  assert.equal(await page.getByLabel("验证码", { exact: true }).inputValue(), "12");
  assert.equal(await page.getByRole("button", { name: /秒后可重发/ }).isDisabled(), true);
  assert.equal(sendRequests, 2);
  await page.getByRole("button", { name: "更换邮箱", exact: true }).click();
  assert.equal(await page.getByLabel("邮箱地址", { exact: true }).inputValue(), "early@example.com");
  await page.getByLabel("邮箱地址", { exact: true }).fill("EARLY@example.com");
  await page.getByRole("button", { name: "继续验证", exact: true }).click();
  assert.equal(await page.getByLabel("验证码", { exact: true }).inputValue(), "12"); assert.equal(sendRequests, 2);
  check("switching methods or returning to the same address retains the challenge, draft and resend cooldown");

  const wrong = code === "000000" ? "111111" : "000000";
  await page.getByLabel("验证码", { exact: true }).fill(wrong); await page.getByLabel("验证码", { exact: true }).press("Enter");
  await page.getByRole("alert").filter({ hasText: "验证码不正确" }).waitFor();
  const fullWidth = code.split("").map(value => String.fromCharCode(value.charCodeAt(0) + 0xfee0)).join("");
  await page.getByLabel("验证码", { exact: true }).evaluate((node, text) => { const data = new DataTransfer(); data.setData("text/plain", `验证码：${text.slice(0, 3)} ${text.slice(3)}`); node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })); }, fullWidth);
  assert.equal(await page.getByLabel("验证码", { exact: true }).inputValue(), code);
  let releaseHome; const homeGate = new Promise(done => { releaseHome = done; });
  await page.route(base + "/", async route => { await homeGate; await route.continue(); });
  await page.getByLabel("验证码", { exact: true }).press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "正在进入你的空间…" && button.disabled));
  releaseHome(); await page.waitForURL(base + "/"); await page.getByRole("button", { name: "打开模型设置", exact: true }).waitFor();
  check("formatted OTP paste and Enter recover from wrong codes; redirect stays locked until the workspace opens");

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const phone = await mobile.newPage(); phone.on("pageerror", error => errors.push(error.message)); await phone.clock.install();
  await phone.goto(base + "/login"); await phone.getByLabel("邮箱地址", { exact: true }).fill("expiry@example.com");
  await phone.getByRole("button", { name: "获取验证码", exact: true }).click(); await phone.getByLabel("验证码", { exact: true }).waitFor();
  await phone.getByLabel("验证码", { exact: true }).fill("123456"); await phone.clock.fastForward(301_000);
  await phone.getByText("验证码已过期", { exact: true }).waitFor();
  assert.equal(await phone.getByRole("button", { name: "登录 / 注册", exact: true }).isDisabled(), true);
  await phone.route("**/api/auth/send", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ challengeId: "test-refreshed", destination: "ex***@example.com", retryAfter: 60, expiresIn: 300 }) }));
  await phone.getByRole("button", { name: "重新发送验证码", exact: true }).click();
  assert.equal(await phone.getByLabel("验证码", { exact: true }).inputValue(), "");
  assert.equal(await phone.getByRole("button", { name: /秒后可重发/ }).isDisabled(), true);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await phone.screenshot({ path: ".sites-runtime/screenshots/login-smooth-code-mobile.png", fullPage: true });
  await phone.getByRole("button", { name: "更换邮箱", exact: true }).click();
  await phone.screenshot({ path: ".sites-runtime/screenshots/login-smooth-mobile.png", fullPage: true });
  check("expiration prevents stale verification; resend resets the input and timer, and phone layouts fit");

  const timeoutContext = await browser.newContext(); const timeout = await timeoutContext.newPage(); timeout.on("pageerror", error => errors.push(error.message)); await timeout.clock.install();
  await timeout.route("**/api/auth/send", () => {});
  await timeout.goto(base + "/login"); await timeout.getByLabel("邮箱地址", { exact: true }).fill("timeout@example.com");
  await timeout.getByRole("button", { name: "获取验证码", exact: true }).click(); await timeout.clock.fastForward(31_000);
  await timeout.getByRole("alert").filter({ hasText: "请求等待较久" }).waitFor();
  assert.equal(await timeout.getByRole("button", { name: "获取验证码", exact: true }).isEnabled(), true);
  assert.equal(await timeout.getByLabel("邮箱地址", { exact: true }).inputValue(), "timeout@example.com");
  assert.deepEqual(errors, []);
  check("slow requests time out with a retryable message and retained input, without browser errors");
  console.log(JSON.stringify({ passed, browserErrors: errors, actualEmailsSent: 0, authScriptRawBytes: raw.body.length, authScriptBrotliBytes: br.body.length, authCssBytes: (await stat("standalone-dist/public/assets/auth.css")).size }));
} finally { await browser?.close(); if (server.exitCode === null) { const done = new Promise(resolve => server.once("exit", resolve)); server.kill(); await done; } }
