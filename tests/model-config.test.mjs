import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModelConfig, buildModelRequest } from "../lib/model-config.ts";
import { providerIds, providers } from "../lib/providers.ts";

const endpoints = {
  deepseek: "https://api.deepseek.com/chat/completions",
  glm: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  kimi: "https://api.moonshot.cn/v1/chat/completions",
};
for (const provider of providerIds) {
  test(`${provider}: a user key goes only to the selected official endpoint`, () => {
    const config = resolveModelConfig({ provider, apiKey: `test-only-${provider}` }, { MODEL_API_KEY: "server-key", MODEL_BASE_URL: "https://other.example/v1", MODEL_NAME: "server-model" });
    const request = buildModelRequest(config, "请输出 JSON", "待整理的原始文本");
    assert.equal(request.endpoint, endpoints[provider]);
    assert.equal(request.init.headers.Authorization, `Bearer test-only-${provider}`);
    assert.equal(request.init.redirect, "error");
    const payload = JSON.parse(request.init.body);
    assert.equal(payload.model, providers[provider].models[0]);
    assert.equal(payload.messages[1].content, "待整理的原始文本");
    assert.deepEqual(payload.response_format, { type: "json_object" });
  });
}

test("provider-specific parameters preserve non-thinking JSON generation", () => {
  const payload = provider => JSON.parse(buildModelRequest(resolveModelConfig({ provider, apiKey: "test" }, {}), "system", "input").init.body);
  assert.deepEqual(payload("deepseek").thinking, { type: "disabled" });
  assert.deepEqual(payload("glm").thinking, { type: "disabled" });
  assert.equal(payload("qwen").enable_thinking, false);
  assert.equal(payload("qwen").thinking, undefined);
  assert.deepEqual(payload("kimi").thinking, { type: "disabled" });
  assert.equal(payload("kimi").temperature, undefined);
});

test("an explicitly selected provider without its own key never borrows the server key", () => {
  for (const provider of providerIds) {
    assert.throws(() => resolveModelConfig({ provider }, { MODEL_API_KEY: "server-secret" }), /选定/);
    assert.throws(() => resolveModelConfig({ provider, apiKey: "   " }, { MODEL_API_KEY: "server-secret" }), /选定/);
  }
});

test("server defaults remain backwards compatible; explicit server providers use their own defaults", () => {
  assert.equal(resolveModelConfig({}, { MODEL_API_KEY: "key" }).provider, "deepseek");
  assert.equal(resolveModelConfig({}, { MODEL_API_KEY: "key", MODEL_BASE_URL: providers.glm.baseURL }).model, "glm-4.7");
  assert.equal(resolveModelConfig({}, { MODEL_API_KEY: "key", MODEL_PROVIDER: "glm" }).baseURL, providers.glm.baseURL);
  assert.throws(() => resolveModelConfig({}, { MODEL_API_KEY: "key", MODEL_PROVIDER: "glm", MODEL_BASE_URL: providers.deepseek.baseURL }), /不一致/);
  assert.throws(() => resolveModelConfig({}, { MODEL_API_KEY: "key", MODEL_PROVIDER: "invalid" }), /配置不正确/);
});

test("old DeepSeek requests still work; custom model names cannot redirect keys", () => {
  const old = resolveModelConfig({ apiKey: "old-client-key", model: "deepseek-v4-pro" }, {});
  assert.equal(old.provider, "deepseek");
  const custom = resolveModelConfig({ provider: "glm", apiKey: "glm-key", model: "glm-custom", baseURL: "https://attacker.invalid" }, {});
  assert.equal(buildModelRequest(custom, "system", "input").endpoint, endpoints.glm);
  assert.equal(custom.model, "glm-custom");
  assert.throws(() => resolveModelConfig({ provider: "__proto__", apiKey: "key" }, {}), /提供商/);
});

test("custom thinking-only models are not forced into unsupported non-thinking mode", () => {
  const glm = JSON.parse(buildModelRequest(resolveModelConfig({ provider: "glm", apiKey: "key", model: "glm-5.3" }, {}), "system", "input").init.body);
  assert.equal(glm.thinking, undefined);
  assert.equal(glm.temperature, undefined);
  const kimi = JSON.parse(buildModelRequest(resolveModelConfig({ provider: "kimi", apiKey: "key", model: "kimi-k3" }, {}), "system", "input").init.body);
  assert.equal(kimi.thinking, undefined);
  assert.equal(kimi.reasoning_effort, "low");
});

test("non-HTTPS server endpoints cannot receive keys", () => {
  assert.throws(() => buildModelRequest(resolveModelConfig({}, { MODEL_API_KEY: "key", MODEL_BASE_URL: "http://localhost:9000" }), "system", "input"), /HTTPS/);
});
