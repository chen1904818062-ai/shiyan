import { test } from "node:test";
import assert from "node:assert/strict";
import { roleSegments, roleAt, parseRoles } from "../lib/summary.ts";
import { locateQuote, normalizeOccurred, validateMemoryDrafts } from "../lib/memory/validate.ts";
import { scoreConfidence, spanDays } from "../lib/memory/confidence.ts";
import { statementKey, mergeDrafts } from "../lib/memory/merge.ts";

const draft = (overrides = {}) => ({
  kind: "goal",
  statement: "我要找一份运营实习",
  detail: "",
  occurredAt: null,
  occurredPrecision: "unknown",
  basis: "stated",
  quote: "我想找运营实习",
  sensitivity: "normal",
  ...overrides,
});

test("role segments keep character offsets so a quote can be attributed", () => {
  const content = "用户：我想找实习。\nAI：先整理经历。\n我：好的。";
  const segments = roleSegments(content);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].role, "user");
  assert.equal(content.slice(segments[0].start, segments[0].end).trim(), "我想找实习。");
  assert.equal(roleAt(content, content.indexOf("先整理经历")), "assistant");
  assert.equal(roleAt(content, content.indexOf("好的")), "user");
});

test("role parsing stays identical to the original report behaviour", () => {
  assert.deepEqual(parseRoles("聊天记录\n用户：我想找实习。\n偏向运营。\n豆包：先整理经历。\nYou said: 好的\nChatGPT said: 可以。"), [
    { role: "unknown", text: "聊天记录" },
    { role: "user", text: "我想找实习。\n偏向运营。" },
    { role: "assistant", text: "先整理经历。" },
    { role: "user", text: "好的" },
    { role: "assistant", text: "可以。" },
  ]);
});

test("quote lookup tolerates changed line breaks and spaces", () => {
  const content = "用户：我想\n找一份运营实习。";
  const hit = locateQuote(content, "我想找一份");
  assert.ok(hit);
  assert.equal(content.slice(hit.start, hit.end).replace(/\s+/g, ""), "我想找一份");
  assert.equal(locateQuote(content, "我拿到了 offer"), null);
});

test("AI lines can never become a memory about the user", () => {
  const conversation = { id: "c1", content: "用户：我想找运营实习。\nAI：你应该先做一份能力盘点。" };
  const result = validateMemoryDrafts({ memories: [draft({ quote: "你应该先做一份能力盘点" })] }, conversation);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.assistant_attribution, 1);
});

test("a grounded user memory keeps its exact source span", () => {
  const conversation = { id: "c1", content: "用户：我想找运营实习。\nAI：你应该先做一份能力盘点。" };
  const result = validateMemoryDrafts({ memories: [draft()] }, conversation);
  assert.equal(result.accepted.length, 1);
  const [memory] = result.accepted;
  assert.equal(memory.role, "user");
  assert.equal(conversation.content.slice(memory.start, memory.end), "我想找运营实习");
  assert.equal(memory.confidence, "low");
});

test("fabricated quotes are dropped instead of stored", () => {
  const conversation = { id: "c1", content: "用户：我想找运营实习。" };
  const result = validateMemoryDrafts({ memories: [draft({ quote: "我已经拿到三个 offer" })] }, conversation);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.quote_not_found, 1);
});

test("unlabelled speakers stay candidates at the lowest confidence", () => {
  const conversation = { id: "c2", content: "我想先工作两年，再考虑读研。" };
  const result = validateMemoryDrafts({ memories: [draft({ kind: "wish", statement: "我想先工作两年再考虑读研", quote: "我想先工作两年" })] }, conversation);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].role, "unknown");
  assert.equal(result.accepted[0].confidence, "low");
});

test("occurred dates are normalised and impossible dates are rejected", () => {
  assert.deepEqual(normalizeOccurred("2026-10-12"), { occurredAt: "2026-10-12", occurredPrecision: "day" });
  assert.deepEqual(normalizeOccurred("2026-10"), { occurredAt: "2026-10", occurredPrecision: "month" });
  assert.deepEqual(normalizeOccurred("2026"), { occurredAt: "2026", occurredPrecision: "year" });
  assert.deepEqual(normalizeOccurred("2026-02-30"), { occurredAt: null, occurredPrecision: "unknown" });
  assert.deepEqual(normalizeOccurred(null), { occurredAt: null, occurredPrecision: "unknown" });
});

test("confidence rises only with independent evidence over time", () => {
  assert.equal(scoreConfidence({ evidenceCount: 1, distinctConversations: 1, spanDays: 0 }), "low");
  assert.equal(scoreConfidence({ evidenceCount: 2, distinctConversations: 2, spanDays: 0 }), "medium");
  assert.equal(scoreConfidence({ evidenceCount: 3, distinctConversations: 3, spanDays: 200 }), "high");
  assert.equal(scoreConfidence({ evidenceCount: 3, distinctConversations: 3, spanDays: 200, basis: "inferred" }), "medium");
  assert.equal(scoreConfidence({ evidenceCount: 1, distinctConversations: 1, spanDays: 0, confirmed: true }), "high");
  assert.equal(spanDays("2026-01-01", "2026-07-01"), 181);
});

test("the same statement is merged instead of stored twice", () => {
  assert.equal(statementKey("我 想找一份运营实习。"), statementKey("我想找一份运营实习"));
  const merged = mergeDrafts([
    { draft: { kind: "goal", statement: "我要找运营实习", detail: "", quote: "a", occurredAt: null, occurredPrecision: "unknown" } },
    { draft: { kind: "goal", statement: "我要找运营实习。", detail: "补充背景", quote: "b", occurredAt: "2026-09", occurredPrecision: "month" } },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].draft.detail, "补充背景");
  assert.equal(merged[0].draft.occurredAt, "2026-09");
});
