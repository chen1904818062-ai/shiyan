import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { providers, providerIds } from "../lib/providers.ts";
import { signIn } from "./browser-auth.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
let topicId;
let passed = 0;
const check = message => { passed++; console.log("PASS " + message); };
try {
  await mkdir(".sites-runtime/screenshots", { recursive: true });
  await signIn(page, base);
  await page.getByRole("heading", { name: "我的话题." }).waitFor();
  await page.locator(".loading-state").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "打开模型设置", exact: true }).click();
  await page.getByLabel("模型提供商", { exact: true }).waitFor();
  assert.deepEqual(await page.getByLabel("模型提供商", { exact: true }).locator("option").allTextContents(), providerIds.map(id => providers[id].label));
  for (const provider of providerIds) {
    await page.getByLabel("模型提供商", { exact: true }).selectOption(provider);
    const key = page.getByLabel(providers[provider].label + " API Key", { exact: true });
    assert.equal(await key.inputValue(), "");
    assert.equal(await key.getAttribute("type"), "password");
    assert.equal(await page.getByLabel("模型", { exact: true }).inputValue(), providers[provider].models[0]);
    await key.fill("test-only-key-" + provider);
    if (providers[provider].models.length > 1) {
      await page.getByLabel("模型", { exact: true }).selectOption(providers[provider].models[1]);
      assert.equal(await page.getByLabel("模型", { exact: true }).inputValue(), providers[provider].models[1]);
      await page.getByLabel("模型", { exact: true }).selectOption(providers[provider].models[0]);
    }
  }
  check("four provider choices have the right defaults, presets and independently masked keys");
  await page.getByLabel("模型提供商", { exact: true }).selectOption("glm");
  assert.equal(await page.getByLabel("智谱 GLM API Key", { exact: true }).inputValue(), "test-only-key-glm");
  await page.getByLabel("模型", { exact: true }).selectOption("custom");
  await page.getByLabel("自定义模型名称", { exact: true }).fill("glm-custom-test");
  await page.getByRole("button", { name: "应用配置" }).click();
  await page.getByRole("button", { name: "打开模型设置", exact: true }).click();
  assert.equal(await page.getByLabel("模型提供商", { exact: true }).inputValue(), "glm");
  assert.equal(await page.getByLabel("自定义模型名称", { exact: true }).inputValue(), "glm-custom-test");
  await page.screenshot({ path: ".sites-runtime/screenshots/model-settings-desktop.png", fullPage: true });
  check("custom model names and the applied provider survive reopening settings");
  await page.getByLabel("模型", { exact: true }).selectOption("glm-4.7");
  await page.getByRole("button", { name: "应用配置" }).click();

  const created = await context.request.post(base + "/api/topics", { data: { title: "模型切换验收", description: "模型设置测试" } });
  topicId = (await created.json()).topic.id;
  await context.request.post(`${base}/api/topics/${topicId}/conversations`, { data: { title: "求职准备", source: "ChatGPT", content: "用户：我想准备一份求职简历。\nAI：可以先整理校园活动经历。" } });
  await page.reload(); // Reload drops the keys. Verify that before setting them again.
  await page.getByRole("heading", { name: "模型切换验收", exact: true }).waitFor();
  await page.getByRole("button", { name: "打开模型设置", exact: true }).click();
  for (const provider of providerIds) {
    await page.getByLabel("模型提供商", { exact: true }).selectOption(provider);
    assert.equal(await page.getByLabel(providers[provider].label + " API Key", { exact: true }).inputValue(), "");
  }
  assert.equal(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]).includes("test-only-key")), false);
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  check("page reload clears all provider keys and browser storage contains no key");

  await page.getByRole("heading", { name: "模型切换验收", exact: true }).click();
  await page.getByRole("button", { name: "生成精简总结" }).waitFor();
  const captured = [];
  await page.route("**/api/topics/*/summarize", async route => {
    captured.push(route.request().postDataJSON());
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "参数验收完成，未调用付费模型。" }) });
  });
  for (const provider of providerIds) {
    await page.getByRole("button", { name: "打开模型设置", exact: true }).click();
    await page.getByLabel("模型提供商", { exact: true }).selectOption(provider);
    await page.getByLabel(providers[provider].label + " API Key", { exact: true }).fill("test-only-key-" + provider);
    await page.getByRole("button", { name: "应用配置" }).click();
    await page.getByRole("button", { name: "生成精简总结" }).click();
    await page.getByRole("alert").filter({ hasText: "参数验收完成" }).waitFor();
    const sent = captured.at(-1);
    assert.equal(sent.provider, provider); assert.equal(sent.apiKey, "test-only-key-" + provider); assert.equal(sent.model, providers[provider].models[0]);
    await page.getByRole("button", { name: "关闭错误提示" }).click();
  }
  check("each summary request includes only the selected provider, model and matching key (mocked transport)");
  for (const data of [{ provider: "invalid", apiKey: "test-only" }, { provider: "glm", apiKey: "test-only", baseURL: "https://attacker.invalid" }, { provider: "qwen", apiKey: "test-only", endpoint: "https://attacker.invalid" }]) {
    assert.equal((await context.request.post(`${base}/api/topics/${topicId}/summarize`, { data })).status(), 400);
  }
  for (const provider of providerIds) assert.equal((await context.request.post(`${base}/api/topics/${topicId}/summarize`, { data: { provider } })).status(), 422);
  check("the server rejects unknown providers, arbitrary endpoint injection and missing provider keys");

  await page.getByRole("button", { name: "打开模型设置", exact: true }).click();
  await page.getByLabel("模型提供商", { exact: true }).selectOption("glm");
  await page.getByRole("button", { name: "清除当前提供商密钥" }).click();
  assert.equal(await page.getByLabel("智谱 GLM API Key", { exact: true }).inputValue(), "");
  await page.getByLabel("模型提供商", { exact: true }).selectOption("deepseek");
  assert.equal(await page.getByLabel("DeepSeek API Key", { exact: true }).inputValue(), "test-only-key-deepseek");
  await page.getByLabel("模型提供商", { exact: true }).selectOption("glm");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".sites-runtime/screenshots/model-settings-mobile.png", fullPage: true });
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.evaluate(() => document.querySelector("dialog").getBoundingClientRect().width < innerWidth));
  }
  check("clearing one provider leaves other keys intact and settings fit phone and desktop screens");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed, browserErrors: errors, paidModelCalls: 0 }));
} finally {
  if (topicId) await context.request.delete(`${base}/api/topics/${topicId}`).catch(() => {});
  await browser.close();
}
