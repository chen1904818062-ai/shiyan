import type { AcceptedMemory } from "./validate.ts";
import { scoreConfidence, spanDays } from "./confidence.ts";
import { statementKey } from "./merge.ts";
import type { MemoryEvidenceRecord, MemoryRecord, MemoryStats } from "./types.ts";

type MemoryRow = {
  id: string;
  kind: string;
  statement: string;
  detail: string;
  occurredAt: string | null;
  occurredPrecision: string;
  basis: string;
  confidence: string;
  status: string;
  sensitivity: string;
  sourceRole: string;
  sourceConversationId: string | null;
  conversationTitle: string;
  conversationSource: string;
  topicId: string;
  topicTitle: string;
  createdAt: string;
  updatedAt: string;
};

type EvidenceRow = {
  id: string;
  memoryId: string;
  conversationId: string;
  quote: string;
  charStart: string | null;
  charEnd: string | null;
  speakerRole: string;
  conversationTitle: string;
};

export type ListOptions = {
  id?: string;
  kinds?: string[];
  status?: string;
  topicId?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

const MEMORY_SELECT = `SELECT m.id, m.kind, m.statement, m.detail, m.occurred_at AS occurredAt,
  m.occurred_precision AS occurredPrecision, m.basis, m.confidence, m.status, m.sensitivity,
  m.source_role AS sourceRole, m.source_conversation_id AS sourceConversationId,
  c.title AS conversationTitle, c.source AS conversationSource,
  t.id AS topicId, t.title AS topicTitle, m.created_at AS createdAt, m.updated_at AS updatedAt
  FROM memories m
  INNER JOIN conversations c ON c.id = m.source_conversation_id
  INNER JOIN topics t ON t.id = c.topic_id`;

function toRecord(row: MemoryRow, evidence: MemoryEvidenceRecord[]): MemoryRecord {
  return {
    ...row,
    kind: row.kind as MemoryRecord["kind"],
    occurredPrecision: row.occurredPrecision as MemoryRecord["occurredPrecision"],
    basis: row.basis as MemoryRecord["basis"],
    confidence: row.confidence as MemoryRecord["confidence"],
    status: row.status as MemoryRecord["status"],
    sensitivity: row.sensitivity as MemoryRecord["sensitivity"],
    sourceRole: row.sourceRole as MemoryRecord["sourceRole"],
    evidence,
  };
}

export async function listMemories(db: D1Database, ownerId: string, options: ListOptions = {}) {
  const where = ["m.owner_id = ?", "t.owner_id = ?"];
  const binds: unknown[] = [ownerId, ownerId];
  if (options.id) { where.push("m.id = ?"); binds.push(options.id); }
  if (options.kinds?.length) { where.push("m.kind IN (SELECT value FROM json_each(?))"); binds.push(JSON.stringify(options.kinds)); }
  if (options.status) { where.push("m.status = ?"); binds.push(options.status); }
  if (options.topicId) { where.push("c.topic_id = ?"); binds.push(options.topicId); }
  if (options.q) { where.push("(m.statement LIKE ? OR m.detail LIKE ?)"); binds.push(`%${options.q}%`, `%${options.q}%`); }
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const sql = `${MEMORY_SELECT} WHERE ${where.join(" AND ")} ORDER BY COALESCE(m.occurred_at, m.created_at) DESC, m.created_at DESC LIMIT ? OFFSET ?`;
  const { results } = await db.prepare(sql).bind(...binds, limit, offset).all<MemoryRow>();
  if (!results.length) return [];
  const evidence = await db.prepare(`SELECT e.id, e.memory_id AS memoryId, e.conversation_id AS conversationId, e.quote,
    e.char_start AS charStart, e.char_end AS charEnd, e.speaker_role AS speakerRole, c.title AS conversationTitle
    FROM memory_evidence e INNER JOIN conversations c ON c.id = e.conversation_id
    WHERE e.memory_id IN (SELECT value FROM json_each(?)) ORDER BY e.created_at ASC`)
    .bind(JSON.stringify(results.map(row => row.id))).all<EvidenceRow>();
  const grouped = new Map<string, MemoryEvidenceRecord[]>();
  for (const row of evidence.results) {
    const item: MemoryEvidenceRecord = {
      id: row.id,
      quote: row.quote,
      charStart: row.charStart === null ? null : Number(row.charStart),
      charEnd: row.charEnd === null ? null : Number(row.charEnd),
      conversationId: row.conversationId,
      conversationTitle: row.conversationTitle,
      speakerRole: row.speakerRole as MemoryEvidenceRecord["speakerRole"],
    };
    const list = grouped.get(row.memoryId) || [];
    list.push(item);
    grouped.set(row.memoryId, list);
  }
  return results.map(row => toRecord(row, grouped.get(row.id) || []));
}

export async function memoryStats(db: D1Database, ownerId: string): Promise<MemoryStats> {
  const totals = await db.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN m.status = 'candidate' THEN 1 ELSE 0 END), 0) AS candidate,
    COALESCE(SUM(CASE WHEN m.status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed,
    COUNT(DISTINCT c.topic_id) AS topics
    FROM memories m LEFT JOIN conversations c ON c.id = m.source_conversation_id
    WHERE m.owner_id = ?`).bind(ownerId).first<{ total: number; candidate: number; confirmed: number; topics: number }>();
  const kinds = await db.prepare("SELECT kind, COUNT(*) AS n FROM memories WHERE owner_id = ? GROUP BY kind").bind(ownerId).all<{ kind: string; n: number }>();
  const byKind: Record<string, number> = {};
  for (const row of kinds.results) byKind[row.kind] = Number(row.n);
  return {
    total: Number(totals?.total || 0),
    candidate: Number(totals?.candidate || 0),
    confirmed: Number(totals?.confirmed || 0),
    topics: Number(totals?.topics || 0),
    byKind,
  };
}

export async function refreshConfidence(db: D1Database, ownerId: string, ids: string[]) {
  for (const id of new Set(ids)) {
    const row = await db.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT e.conversation_id) AS c,
      MIN(COALESCE(conv.conversation_date, m.occurred_at, conv.imported_at)) AS firstAt,
      MAX(COALESCE(conv.conversation_date, m.occurred_at, conv.imported_at)) AS lastAt,
      m.basis AS basis, m.status AS status
      FROM memory_evidence e INNER JOIN memories m ON m.id = e.memory_id
      INNER JOIN conversations conv ON conv.id = e.conversation_id
      WHERE e.memory_id = ? AND m.owner_id = ?`).bind(id, ownerId)
      .first<{ n: number; c: number; firstAt: string | null; lastAt: string | null; basis: string; status: string }>();
    if (!row) continue;
    const confidence = scoreConfidence({
      evidenceCount: Number(row.n),
      distinctConversations: Number(row.c),
      spanDays: spanDays(row.firstAt, row.lastAt),
      basis: row.basis,
      confirmed: row.status === "confirmed",
    });
    await db.prepare("UPDATE memories SET confidence = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
      .bind(confidence, new Date().toISOString(), id, ownerId).run();
  }
}

// 同一陈述在同一用户下只保留一条记忆，重复出现时只累积证据。
export async function saveAcceptedMemories(db: D1Database, ownerId: string, items: AcceptedMemory[]) {
  if (!items.length) return { created: 0, merged: 0, touched: [] as string[] };
  const now = new Date().toISOString();
  let created = 0;
  let merged = 0;
  const touched: string[] = [];
  for (const item of items) {
    const id = crypto.randomUUID();
    const results = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO memories (id, owner_id, kind, statement, statement_key, detail, occurred_at, occurred_precision, basis, confidence, status, sensitivity, source_conversation_id, source_role, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM conversations c INNER JOIN topics t ON t.id=c.topic_id WHERE c.id=? AND t.owner_id=?)`)
        .bind(id, ownerId, item.draft.kind, item.draft.statement, statementKey(item.draft.statement), item.draft.detail, item.draft.occurredAt, item.draft.occurredPrecision, item.draft.basis, item.confidence, item.draft.sensitivity, item.conversationId, item.role, now, now,item.conversationId,ownerId),
      db.prepare(`INSERT INTO memory_evidence (id, memory_id, conversation_id, quote, char_start, char_end, speaker_role, created_at)
        SELECT ?, m.id, ?, ?, ?, ?, ?, ? FROM memories m WHERE m.owner_id=? AND m.kind=? AND m.statement_key=?
        AND EXISTS (SELECT 1 FROM conversations c INNER JOIN topics t ON t.id=c.topic_id WHERE c.id=? AND t.owner_id=?)
        AND NOT EXISTS (SELECT 1 FROM memory_evidence e WHERE e.memory_id=m.id AND e.conversation_id=? AND e.quote=?)`)
        .bind(crypto.randomUUID(), item.conversationId, item.draft.quote, String(item.start), String(item.end), item.role, now,ownerId,item.draft.kind,statementKey(item.draft.statement),item.conversationId,ownerId,item.conversationId,item.draft.quote),
    ]);
    if (item.draft.sensitivity !== "normal") await db.prepare("UPDATE memories SET sensitivity = ?, updated_at = ? WHERE owner_id=? AND kind=? AND statement_key=? AND sensitivity='normal'").bind(item.draft.sensitivity,now,ownerId,item.draft.kind,statementKey(item.draft.statement)).run();
    const memory = await db.prepare("SELECT id FROM memories WHERE owner_id=? AND kind=? AND statement_key=?").bind(ownerId,item.draft.kind,statementKey(item.draft.statement)).first<{id:string}>();
    if (memory) touched.push(memory.id);
    if (results[0].meta.changes) created++; else if (memory) merged++;
  }
  await refreshConfidence(db, ownerId, touched);
  return { created, merged, touched };
}

export async function ownedMemory(db: D1Database, ownerId: string, id: string) {
  return db.prepare(`${MEMORY_SELECT} WHERE m.id = ? AND m.owner_id = ?`).bind(id, ownerId).first<MemoryRow>();
}
