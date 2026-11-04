import { z } from "zod";
import { roleAt, roleSegments } from "../summary.ts";
import {
  basisLevels, memoryKinds, precisionLevels, sensitivityLevels, userOnlyKind,
  type BasisLevel, type MemoryKind, type PrecisionLevel, type SensitivityLevel,
} from "./taxonomy.ts";
import { scoreConfidence } from "./confidence.ts";
import { mergeDrafts } from "./merge.ts";

export type MemoryDraft = {
  kind: MemoryKind;
  statement: string;
  detail: string;
  occurredAt: string | null;
  occurredPrecision: PrecisionLevel;
  basis: BasisLevel;
  quote: string;
  sensitivity: SensitivityLevel;
};

export type AcceptedMemory = {
  draft: MemoryDraft;
  conversationId: string;
  start: number;
  end: number;
  role: "user" | "assistant" | "unknown";
  confidence: "low" | "medium" | "high";
};

export type RejectionCode = "invalid" | "quote_not_found" | "assistant_attribution";
export type ValidationResult = { accepted: AcceptedMemory[]; rejected: Partial<Record<RejectionCode, number>> };

const draftSchema = z.object({
  kind: z.enum(memoryKinds),
  statement: z.string().trim().min(4).max(200),
  detail: z.string().trim().max(600).default(""),
  occurredAt: z.string().trim().max(20).nullish(),
  occurredPrecision: z.enum(precisionLevels).default("unknown"),
  basis: z.enum(basisLevels).default("stated"),
  quote: z.string().trim().min(2).max(400),
  sensitivity: z.enum(sensitivityLevels).default("normal"),
}).strict();

export const memoryResponseSchema = z.object({ memories: z.array(draftSchema).max(12) }).strict();

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const YEAR = /^\d{4}$/;

export function normalizeOccurred(raw: string | null | undefined): { occurredAt: string | null; occurredPrecision: PrecisionLevel } {
  const value = raw?.trim();
  if (!value) return { occurredAt: null, occurredPrecision: "unknown" };
  if (DAY.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return { occurredAt: value, occurredPrecision: "day" };
    return { occurredAt: null, occurredPrecision: "unknown" };
  }
  const month = MONTH.exec(value);
  if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) return { occurredAt: value, occurredPrecision: "month" };
  if (YEAR.test(value)) return { occurredAt: value, occurredPrecision: "year" };
  return { occurredAt: null, occurredPrecision: "unknown" };
}

// 忽略空白与换行的引文定位：模型复述原文时经常改动空格和分段。
export function locateQuote(content: string, quote: string): { start: number; end: number } | null {
  const target = quote.replace(/\s+/g, "");
  if (!target) return null;
  let normalized = "";
  const map: number[] = [];
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (/\s/.test(char)) continue;
    normalized += char;
    map.push(i);
  }
  const index = normalized.indexOf(target);
  if (index < 0) return null;
  return { start: map[index], end: map[index + target.length - 1] + 1 };
}

export function validateMemoryDrafts(raw: unknown, conversation: { id: string; content: string }): ValidationResult {
  const rejected: Partial<Record<RejectionCode, number>> = {};
  const parsed = memoryResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const count = Array.isArray((raw as { memories?: unknown })?.memories) ? (raw as { memories: unknown[] }).memories.length : 1;
    return { accepted: [], rejected: { invalid: count } };
  }
  const accepted: AcceptedMemory[] = [];
  for (const draft of parsed.data.memories) {
    const located = locateQuote(conversation.content, draft.quote);
    if (!located) { rejected.quote_not_found = (rejected.quote_not_found || 0) + 1; continue; }
    const role = roleAt(conversation.content, located.start);
    if (roleSegments(conversation.content).some(segment => segment.start < located.end && segment.end > located.start && segment.role !== role)) {
      rejected.assistant_attribution = (rejected.assistant_attribution || 0) + 1; continue;
    }
    // 铁律二：AI 说的话不能成为关于「我」的记忆，只能作为参考观点存在。
    if (role === "assistant" && userOnlyKind(draft.kind)) {
      rejected.assistant_attribution = (rejected.assistant_attribution || 0) + 1;
      continue;
    }
    const occurred = normalizeOccurred(draft.occurredAt);
    const memory: MemoryDraft = {
      kind: draft.kind,
      statement: draft.statement,
      detail: draft.detail,
      occurredAt: occurred.occurredAt,
      occurredPrecision: occurred.occurredPrecision,
      basis: draft.basis,
      quote: draft.quote.trim(),
      sensitivity: draft.sensitivity,
    };
    accepted.push({
      draft: memory,
      conversationId: conversation.id,
      start: located.start,
      end: located.end,
      role,
      // 说话人未标注时只能作为待确认的候选，置信度压到最低。
      confidence: role === "unknown" ? "low" : scoreConfidence({ evidenceCount: 1, distinctConversations: 1, spanDays: 0, basis: draft.basis }),
    });
  }
  return { accepted: mergeDrafts(accepted), rejected };
}

export function describeRejections(rejected: Partial<Record<RejectionCode, number>>) {
  const parts: string[] = [];
  if (rejected.quote_not_found) parts.push(`${rejected.quote_not_found} 条引文在原文中找不到`);
  if (rejected.assistant_attribution) parts.push(`${rejected.assistant_attribution} 条把 AI 的说法写成了你的`);
  if (rejected.invalid) parts.push(`${rejected.invalid} 条格式不完整`);
  return parts.join("，");
}
