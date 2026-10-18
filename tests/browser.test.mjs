import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { signIn } from "./browser-auth.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const checks = [];
const check = message => { checks.push(message); console.log(`PASS ${message}`); };
let topicId;

try {
  await mkdir(".sites-runtime/screenshots", { recursive: true });
  assert.equal((await context.request.get(base + "/api/topics")).status(), 401);
  assert.equal((await context.request.get(base + "/api/model")).status(), 401);
  assert.equal((await context.request.get(base + "/api/topics", { headers: { "oai-authenticated-user-id": "local_seedy", "oai-authenticated-user-email": "fake@test.invalid" } })).status(), 401);
  check("anonymous access and forged identity headers rejected");

  await signIn(page, base);
  await page.getByRole("heading", { name: "我的话题." }).waitFor();
  await page.getByText("你的思考收藏，从这里开始").waitFor();
  assert.equal((await context.request.get(base + "/api/topics")).status(), 200);
  await page.screenshot({ path: ".sites-runtime/screenshots/desktop-home.png", fullPage: true });
  check("signed-in workspace loads without fake personal data");

  const before = (await (await context.request.get(base + "/api/topics")).json()).topics.length;
  await page.getByRole("button", { name: /先看看整理效果/ }).click();
  await page.getByRole("heading", { name: "聊过的重点，都在这里。" }).waitFor();
  await page.screenshot({ path: ".sites-runtime/screenshots/desktop-summary.png", fullPage: true });
  await page.getByRole("button", { name: /ChatGPT.*从哪里开始选择求职方向/ }).first().click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.locator(".source-content").innerText(), /优先探索/);
  await page.getByRole("button", { name: "返回阅读" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出总结与原文" }).click();
  const download = await downloadPromise;
  await download.saveAs(".sites-runtime/qa-export.md");
  assert.equal((await (await context.request.get(base + "/api/topics")).json()).topics.length, before);
  check("explicit sample, source citations and Markdown export work without seeding user data");

  await page.getByRole("button", { name: "返回我的话题" }).click();
  await page.getByRole("button", { name: "新建话题", exact: true }).last().click();
  await page.getByLabel(/话题名称/).fill("大学生求职 · 验收");
  await page.getByLabel(/想整理些什么/).fill("岗位选择、简历修改和面试准备");
  await page.getByRole("button", { name: "雾蓝", exact: true }).click();
  await page.getByRole("button", { name: "创建话题", exact: true }).click();
  await page.getByRole("heading", { name: "大学生求职 · 验收", exact: true }).waitFor();
  const topic = (await (await context.request.get(base + "/api/topics")).json()).topics.find(t => t.title === "大学生求职 · 验收");
  assert.ok(topic); topicId = topic.id; assert.equal(topic.color, "blue");
  check("topic creation persists name, scope and selected color");

  const content = "\n  用户：我想找内容运营实习，做过校园活动。\n豆包：可以先梳理项目中的个人贡献。\n用户：我会先核实数据，不想编造经历。\n<script>window.__unsafe = true</script>\n ";
  await page.getByRole("button", { name: "添加对话", exact: true }).click();
  await page.getByRole("button", { name: /豆包/ }).click();
  await page.getByLabel(/对话标题/).fill("运营简历准备");
  await page.getByLabel(/粘贴对话内容/).fill(content);
  await page.getByRole("button", { name: "保存对话" }).click();
  await page.getByText("已保存 1 段对话。", { exact: false }).waitFor();
  let detail = await (await context.request.get(`${base}/api/topics/${topicId}`)).json();
  assert.equal(detail.conversations.length, 1); assert.equal(detail.conversations[0].content, content); assert.equal(detail.conversations[0].source, "豆包"); assert.equal(detail.conversations[0].conversationDate, null);
  await page.getByRole("tab", { name: /原始对话/ }).click();
  await page.getByRole("heading", { name: "运营简历准备" }).click();
  assert.equal(await page.locator(".source-content").innerText(), content);
  assert.equal(await page.evaluate(() => Boolean(window.__unsafe)), false);
  await page.getByRole("button", { name: "返回阅读" }).click();
  check("pasted original survives storage with source, unknown date and safe text rendering");

  await page.getByRole("button", { name: "添加对话", exact: true }).click();
  await page.getByLabel(/对话标题/).fill("重复导入");
  await page.getByLabel(/粘贴对话内容/).fill(content);
  await page.getByRole("button", { name: "保存对话" }).click();
  await page.getByRole("alert").filter({ hasText: "已经添加过" }).waitFor();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  detail = await (await context.request.get(`${base}/api/topics/${topicId}`)).json();
  assert.equal(detail.conversations.length, 1);
  check("duplicate imports rejected without creating extra records");

  await page.getByRole("tab", { name: "话题总结" }).click();
  await page.getByRole("button", { name: "生成精简总结" }).click();
  await page.getByRole("heading", { name: "模型设置", exact: true }).waitFor();
  assert.equal(await page.getByLabel("DeepSeek API Key").getAttribute("type"), "password");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  assert.equal((await context.request.post(`${base}/api/topics/${topicId}/summarize`, { data: { kind: "topic" } })).status(), 422);
  detail = await (await context.request.get(`${base}/api/topics/${topicId}`)).json();
  assert.equal(detail.reports.length, 0);
  check("missing key opens model configuration and produces no invented summary");

  for (const [data, status] of [
    [{ title: "过短", source: "豆包", content: "短" }, 400],
    [{ title: "无效日期", source: "豆包", content: "这是一段正常长度的导入文本。", conversationDate: "2026-02-30" }, 400],
    [{ title: "未知来源", source: "invalid", content: "这是一段正常长度的导入文本。" }, 400],
    [{ title: "重复", source: "DeepSeek", content: content.replaceAll("\n", "\r\n") }, 409],
  ]) assert.equal((await context.request.post(`${base}/api/topics/${topicId}/conversations`, { data })).status(), status);
  assert.equal((await context.request.get(`${base}/api/topics/not-owned`)).status(), 404);
  check("server validates lengths, calendar dates, sources, newline-normalized duplicates and ownership");

  await page.reload();
  await page.getByRole("heading", { name: "我的话题." }).waitFor();
  await page.getByRole("heading", { name: "大学生求职 · 验收" }).click();
  await page.getByRole("button", { name: "生成精简总结" }).waitFor();
  check("saved topic and pasted text survive full page reload");

  for (const width of [390, 360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "添加对话", exact: true }).click();
  assert.ok(await page.evaluate(() => document.querySelector("dialog").getBoundingClientRect().width < innerWidth));
  await page.screenshot({ path: ".sites-runtime/screenshots/mobile-paste.png", fullPage: true });
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "返回我的话题" }).click();
  await page.screenshot({ path: ".sites-runtime/screenshots/mobile-home.png", fullPage: true });
  await page.getByRole("button", { name: /先看看整理效果/ }).click();
  await page.screenshot({ path: ".sites-runtime/screenshots/mobile-summary.png", fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check("desktop, tablet and mobile screens fit; mobile paste dialog remains usable");

  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "每周回顾", exact: true }).click();
  await page.getByRole("heading", { name: "每周回顾." }).waitFor();
  await page.locator(".weekly-list").getByRole("button", { name: /大学生求职 · 验收/ }).click();
  assert.equal(await page.getByRole("tab", { name: "每周回顾" }).getAttribute("aria-selected"), "true");
  await page.getByRole("button", { name: "上一周" }).click();
  await page.getByRole("heading", { name: "这一周，还没有新的记录。" }).waitFor();
  check("weekly navigation and week filtering do not confuse import dates with conversation dates");

  await context.request.delete(`${base}/api/conversations/${detail.conversations[0].id}`);
  detail = await (await context.request.get(`${base}/api/topics/${topicId}`)).json();
  assert.equal(detail.conversations.length, 0);
  assert.equal((await context.request.delete(`${base}/api/topics/${topicId}`)).status(), 200);
  assert.equal((await context.request.get(`${base}/api/topics/${topicId}`)).status(), 404);
  topicId = null;
  assert.deepEqual(errors, []);
  check("deletion works and browser reports no JavaScript errors");
  console.log(JSON.stringify({ passed: checks.length, screenshots: ".sites-runtime/screenshots", errors }, null, 2));
} finally {
  if (topicId) await context.request.delete(`${base}/api/topics/${topicId}`).catch(() => {});
  await browser.close();
}
