import type { TopicDetail } from "./types";

export const demo: TopicDetail = {
  topic: { id: "demo", title: "大学生求职", description: "整理求职方向、简历修改和面试准备，留住每次讨论里有用的内容。", color: "sage", createdAt: "2026-10-12T02:00:00Z", updatedAt: "2026-10-16T08:00:00Z", count: 3, sources: ["ChatGPT", "豆包", "DeepSeek"] },
  conversations: [
    { id: "demo-1", topicId: "demo", title: "从哪里开始选择求职方向", source: "ChatGPT", conversationDate: null, importedAt: "2026-10-12T02:00:00Z", content: "用户：我今年大四，学的是市场营销，做过一次校园活动策划，还没有正式实习。我对内容运营和用户运营都感兴趣，想先了解两者的区别。\nChatGPT：内容运营更关注内容选题、生产和传播，用户运营更关注用户分层、活动与留存。你的校园活动可以作为经历素材，但还需要了解不同岗位的实际要求。\n用户：我想先把内容运营作为优先探索的方向，但还没最终确定。\nChatGPT：可以找几份招聘要求，对照你已有的经历和需要补充的能力。" },
    { id: "demo-2", topicId: "demo", title: "把校园活动经历写进简历", source: "豆包", conversationDate: null, importedAt: "2026-10-14T03:00:00Z", content: "用户：我参与了学院读书节，主要负责公众号宣传和现场协调。简历里该怎么写？\n豆包：可以按背景、任务、行动、结果梳理，写清你具体做了什么。如果有阅读量、到场人数等真实记录，可以补充。\n用户：数据我还没有核实，我准备先找同学确认，不想编造数字。\n豆包：没有准确数据时，也可以具体描述完成的工作和产出，不必硬加百分比。" },
    { id: "demo-3", topicId: "demo", title: "准备第一场运营面试", source: "DeepSeek", conversationDate: null, importedAt: "2026-10-16T08:00:00Z", content: "用户：如果面试官问我为什么想做运营，我该怎么准备？\nDeepSeek：可以从你的兴趣、过去经历和对岗位的理解展开。用校园活动中的具体工作说明你做过什么，以及你学到了什么，不建议直接背模板。\n用户：我还没选具体公司，自我介绍也没有写好。\nDeepSeek：先确定目标岗位，再针对岗位要求组织一分钟的自我介绍，可以录音练习后调整。" },
  ],
  reports: [{ id: "demo-report", topicId: "demo", kind: "topic", weekStart: null, sourceIds: ["demo-1", "demo-2", "demo-3"], model: "示例内容", createdAt: "2026-10-16T08:10:00Z", summary: {
    overview: "围绕毕业求职，你从方向探索走到了简历素材和面试准备：内容运营是优先了解的方向，校园活动经历是目前可以继续梳理的素材。",
    highlights: [
      { title: "求职方向：先了解内容运营", text: "讨论区分了内容运营与用户运营的侧重点。你对两个方向都有兴趣，当前优先探索内容运营，还没有最终决定。对照具体岗位要求，有助于判断已有经历与岗位的匹配程度。", sourceIds: ["demo-1"] },
      { title: "简历素材：写清做过的事情", text: "学院读书节中的公众号宣传和现场协调，可以作为经历素材。讨论建议突出个人承担的工作，并使用可核实的成果。", sourceIds: ["demo-2"], details: [{ text: "用户主要负责公众号宣传和现场协调，目前尚未核实活动数据。用户明确表示，准备先找同学确认，不编造数字。", sourceIds: ["demo-2"] }], steps: [{ text: "按背景、任务、行动和结果梳理活动经历，写清个人具体做了什么。", sourceIds: ["demo-2"] }, { text: "查证阅读量、到场人数等真实记录；确认后再补充到简历。", sourceIds: ["demo-2"] }], examples: [{ text: "原文中的经历素材：学院读书节的公众号宣传、现场协调。", sourceIds: ["demo-2"] }], caveats: [{ text: "没有准确数据时，也可以具体描述完成的工作和产出，不必硬加百分比。", sourceIds: ["demo-2"] }] },
      { title: "面试准备：用真实经历支撑动机", text: "关于“为什么做运营”，讨论建议结合兴趣、校园活动经历和岗位理解来回答。自我介绍应根据目标岗位调整，并通过录音练习完善。目前你尚未选择具体公司，也没有完成自我介绍。", sourceIds: ["demo-3"] },
    ],
    positions: [ { text: "优先探索内容运营，但保留继续比较其他方向的空间。", sourceIds: ["demo-1"] }, { text: "先核实活动数据，再写进简历，不编造数字。", sourceIds: ["demo-2"] } ],
    questions: [{ text: "具体投递哪些岗位和公司？活动成果有哪些可核实的记录？", sourceIds: ["demo-1", "demo-2", "demo-3"] }],
    suggestions: [{ text: "可以先选两三份感兴趣的岗位要求，对照读书节经历，列出已具备和待补充的素材。", sourceIds: ["demo-1", "demo-2"] }],
    uncertainty: "原始对话日期未提供，以上按内容归纳，不据导入顺序推断想法变化。",
  } }],
};
