import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoles, currentWeek, chinaDate, inImportWeek, validateSummary, summaryInput } from "../lib/summary.ts";
import { highlightMarkdown } from "../lib/report-export.ts";

test("preserves unlabelled text without inventing speakers", () => {
  assert.deepEqual(parseRoles("我想了解求职。\n可以准备一份简历。"), [{ role: "unknown", text: "我想了解求职。\n可以准备一份简历。" }]);
});
test("preserves multiline user and assistant messages across common labels", () => {
  assert.deepEqual(parseRoles("聊天记录\n用户：我想找实习。\n偏向运营。\n豆包：先整理经历。\nYou said: 好的\nChatGPT said: 可以。"), [
    { role: "unknown", text: "聊天记录" }, { role: "user", text: "我想找实习。\n偏向运营。" }, { role: "assistant", text: "先整理经历。" }, { role: "user", text: "好的" }, { role: "assistant", text: "可以。" },
  ]);
});
test("computes Monday in Shanghai, including UTC boundary", () => {
  assert.equal(currentWeek(new Date("2026-10-11T16:00:00Z")), "2026-10-12");
  assert.equal(currentWeek(new Date("2026-10-11T15:59:59Z")), "2026-10-05");
  assert.equal(chinaDate(new Date("2026-10-16T18:00:00Z")), "2026-10-17");
});
test("weekly import interval is start-inclusive and end-exclusive", () => {
  assert.equal(inImportWeek("2026-10-11T15:59:59.999Z", "2026-10-12"), false);
  assert.equal(inImportWeek("2026-10-11T16:00:00.000Z", "2026-10-12"), true);
  assert.equal(inImportWeek("2026-10-18T15:59:59.999Z", "2026-10-12"), true);
  assert.equal(inImportWeek("2026-10-18T16:00:00.000Z", "2026-10-12"), false);
});
const summary = () => ({ overview: "讨论了简历准备。", highlights: [{ title: "准备简历", text: "梳理已有经历。", sourceIds: ["c1"] }], positions: [], questions: [], suggestions: [], uncertainty: "" });
test("accepts a concise grounded report", () => {
  assert.equal(validateSummary(summary(), [{ id: "c1", content: "用户：我想准备简历。" }]).highlights.length, 1);
});

test('detailed reports preserve steps, source examples and conditions in validation and export',()=>{
  const value=summary();
  value.highlights[0].details=[{text:'先整理两段校园经历，分别写清个人承担的工作。',sourceIds:['c1']}];
  value.highlights[0].steps=[{text:'核实数据后，按背景、任务、行动和结果组织。',sourceIds:['c1']}];
  value.highlights[0].examples=[{text:'原文例子：协调3个社团。',sourceIds:['c1']}];
  value.highlights[0].caveats=[{text:'没有可核实的数字时，写具体产出，不编数字。',sourceIds:['c1']}];
  const parsed=validateSummary(value,[{id:'c1',content:'用户：我想整理简历。AI：原文资料。'}]);
  const markdown=highlightMarkdown(parsed.highlights[0],item=>'- '+item.text);
  assert.match(markdown,/1\. 核实数据/);assert.match(markdown,/协调3个社团/);assert.match(markdown,/不编数字/);
  value.highlights[0].steps[0].sourceIds=['invented'];
  assert.throws(()=>validateSummary(value,[{id:'c1',content:'原文'}]),/不存在/);
});
test("rejects invented original citations", () => {
  const value = summary(); value.highlights[0].sourceIds = ["invented"];
  assert.throws(() => validateSummary(value, [{ id: "c1", content: "原始内容" }]), /不存在/);
});
test("rejects confirmed personal positions derived from unknown or AI-only content", () => {
  for (const content of ["建议考虑考研。", "AI：建议考虑考研。", "ChatGPT：你可以考虑考研。"]){
    const value = summary(); value.positions = [{ text: "决定考研。", sourceIds: ["c1"] }];
    assert.throws(() => validateSummary(value, [{ id: "c1", content }]), /区分/);
  }
});
test("rejects missing citations and malformed model responses", () => {
  const value = summary(); value.highlights[0].sourceIds = [];
  assert.throws(() => validateSummary(value, [{ id: "c1", content: "用户：原文" }]));
  assert.throws(() => validateSummary({ overview: "空报告" }, []));
});
test("keeps actual conversation dates separate from import dates without truncation", () => {
  const content = "用户：" + "经历素材。".repeat(1500);
  const data = JSON.parse(summaryInput({ title: "求职", description: "简历" }, [{ id: "c1", title: "旧对话", source: "豆包", content, conversationDate: "2025-01-01", importedAt: "2026-10-16T00:00:00Z" }], "week", "2026-10-12"));
  assert.equal(data.conversations[0].conversationDate, "2025-01-01");
  assert.equal(data.conversations[0].segments[0].text, content.slice(3));
  assert.match(data.dateMeaning, /不是/);
});
