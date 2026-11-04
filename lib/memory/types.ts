import type {
  BasisLevel, ConfidenceLevel, MemoryKind, MemoryStatus, PrecisionLevel, SensitivityLevel,
} from "./taxonomy.ts";

export type SpeakerRole = "user" | "assistant" | "unknown";

export type MemoryEvidenceRecord = {
  id: string;
  quote: string;
  charStart: number | null;
  charEnd: number | null;
  conversationId: string;
  conversationTitle: string;
  speakerRole: SpeakerRole;
};

export type MemoryRecord = {
  id: string;
  kind: MemoryKind;
  statement: string;
  detail: string;
  occurredAt: string | null;
  occurredPrecision: PrecisionLevel;
  basis: BasisLevel;
  confidence: ConfidenceLevel;
  status: MemoryStatus;
  sensitivity: SensitivityLevel;
  sourceRole: SpeakerRole;
  sourceConversationId: string | null;
  conversationTitle: string;
  conversationSource: string;
  topicId: string;
  topicTitle: string;
  createdAt: string;
  updatedAt: string;
  evidence: MemoryEvidenceRecord[];
};

export type MemoryStats = {
  total: number;
  candidate: number;
  confirmed: number;
  topics: number;
  byKind: Record<string, number>;
};

export type MemoryListResponse = { memories: MemoryRecord[]; stats: MemoryStats };
