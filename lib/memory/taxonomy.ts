// 记忆类型体系。四轴十二类，另设 reference 承接 AI 侧内容。
// 纯常量与纯函数，可被客户端组件直接引用。

export const memoryKinds = [
  "event", "achievement", "role", "relationship", "constraint",
  "preference", "value", "aversion",
  "decision", "belief", "lesson",
  "goal", "wish",
  "reference",
] as const;

export type MemoryKind = typeof memoryKinds[number];
export type MemoryAxis = "fact" | "value" | "judgment" | "intent" | "reference";

export const memoryStatuses = ["candidate", "confirmed", "revised", "retracted", "expired"] as const;
export type MemoryStatus = typeof memoryStatuses[number];

export const confidenceLevels = ["low", "medium", "high"] as const;
export type ConfidenceLevel = typeof confidenceLevels[number];

export const basisLevels = ["stated", "repeated", "inferred"] as const;
export type BasisLevel = typeof basisLevels[number];

export const sensitivityLevels = ["normal", "private", "sensitive"] as const;
export type SensitivityLevel = typeof sensitivityLevels[number];

export const precisionLevels = ["day", "month", "year", "unknown"] as const;
export type PrecisionLevel = typeof precisionLevels[number];

type KindMeta = { axis: MemoryAxis; label: string; hint: string };

export const memoryKindMeta: Record<MemoryKind, KindMeta> = {
  event: { axis: "fact", label: "经历", hint: "做过什么、发生过什么" },
  achievement: { axis: "fact", label: "成果", hint: "可核实的产出或结果" },
  role: { axis: "fact", label: "角色", hint: "实际承担的责任" },
  relationship: { axis: "fact", label: "关系", hint: "重要的人与影响" },
  constraint: { axis: "fact", label: "约束", hint: "时间、经济、家庭、健康限制" },
  preference: { axis: "value", label: "偏好", hint: "喜欢或排斥的做法" },
  value: { axis: "value", label: "价值", hint: "反复出现的优先级" },
  aversion: { axis: "value", label: "排斥", hint: "明确不愿接受的状态" },
  decision: { axis: "judgment", label: "决策", hint: "选择、理由与代价" },
  belief: { axis: "judgment", label: "信念", hint: "对世界的判断，可能被推翻" },
  lesson: { axis: "judgment", label: "教训", hint: "事后修正的认知" },
  goal: { axis: "intent", label: "目标", hint: "明确要达成的方向" },
  wish: { axis: "intent", label: "念头", hint: "仅提及一次的设想" },
  reference: { axis: "reference", label: "参考", hint: "曾咨询过的外部观点" },
};

export const axisMeta: Record<MemoryAxis, { label: string; hint: string }> = {
  fact: { label: "事实", hint: "我做过什么" },
  value: { label: "价值", hint: "我在乎什么" },
  judgment: { label: "判断", hint: "我怎么想、怎么错" },
  intent: { label: "意图", hint: "我要去哪" },
  reference: { label: "参考", hint: "外部观点，不构成关于我的结论" },
};

export const statusLabels: Record<MemoryStatus, string> = {
  candidate: "待确认",
  confirmed: "已确认",
  revised: "已修订",
  retracted: "已推翻",
  expired: "已过期",
};

export const confidenceLabels: Record<ConfidenceLevel, string> = {
  low: "待验证",
  medium: "较可信",
  high: "高可信",
};

export const basisLabels: Record<BasisLevel, string> = {
  stated: "原文明确",
  repeated: "多次出现",
  inferred: "推断",
};

export const sensitivityLabels: Record<SensitivityLevel, string> = {
  normal: "普通",
  private: "私密",
  sensitive: "敏感",
};

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (memoryKinds as readonly string[]).includes(value);
}

export function kindMeta(kind: string): KindMeta {
  return isMemoryKind(kind) ? memoryKindMeta[kind] : { axis: "reference", label: "记忆", hint: "" };
}

export function kindLabel(kind: string) {
  return kindMeta(kind).label;
}

export function axisOf(kind: string): MemoryAxis {
  return kindMeta(kind).axis;
}

// AI 侧内容只能成为 reference，不能成为关于「我」的记忆。
export function userOnlyKind(kind: string) {
  return kind !== "reference";
}

export function statusLabel(status: string) {
  return (statusLabels as Record<string, string>)[status] || status;
}

export function confidenceLabel(confidence: string) {
  return (confidenceLabels as Record<string, string>)[confidence] || confidence;
}

export function basisLabel(basis: string) {
  return (basisLabels as Record<string, string>)[basis] || basis;
}

export function precisionLabel(precision: string) {
  return ({ day: "日", month: "月", year: "年", unknown: "时间未明" } as Record<string, string>)[precision] || "时间未明";
}
