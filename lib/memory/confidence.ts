import type { ConfidenceLevel } from "./taxonomy.ts";

export type ConfidenceInput = {
  evidenceCount: number;
  distinctConversations: number;
  spanDays: number;
  basis?: string;
  confirmed?: boolean;
};

// 置信度用可计算指标得出，不由模型自评。
// 规则：确认即高；三条以上独立证据且跨半年为高；两条以上且跨来源或跨月为中；其余为低。
// 推断类记忆最高只能到中，避免模型推断被当成事实。
export function scoreConfidence(input: ConfidenceInput): ConfidenceLevel {
  if (input.confirmed) return "high";
  if (input.evidenceCount <= 0) return "low";
  const inferred = input.basis === "inferred";
  if (!inferred && input.evidenceCount >= 3 && input.spanDays >= 180) return "high";
  if (input.evidenceCount >= 2 && (input.distinctConversations >= 2 || input.spanDays >= 30)) return "medium";
  return "low";
}

export function spanDays(first: string | null | undefined, last: string | null | undefined) {
  if (!first || !last) return 0;
  const start = Date.parse(first.length === 4 ? `${first}-01-01` : first.length === 7 ? `${first}-01` : first);
  const end = Date.parse(last.length === 4 ? `${last}-12-31` : last.length === 7 ? `${last}-28` : last);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.round((end - start) / 86400_000);
}
