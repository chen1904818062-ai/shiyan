import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("sage"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("topics_owner_idx").on(table.ownerId)]);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  source: text("source").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  conversationDate: text("conversation_date"),
  importedAt: text("imported_at").notNull(),
}, table => [uniqueIndex("conversation_dedupe_idx").on(table.topicId, table.contentHash)]);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  weekStart: text("week_start"),
  summaryJson: text("summary_json").notNull(),
  sourceIdsJson: text("source_ids_json").notNull(),
  model: text("model").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("reports_topic_idx").on(table.topicId), index("reports_created_idx").on(table.createdAt)]);

// L1 记忆原子。每条记忆都必须能回跳到一段原文，否则不入库。
export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  statement: text("statement").notNull(),
  // 归一化后的陈述，用于跨对话去重；同名同类记忆只保留一条，证据累积。
  statementKey: text("statement_key").notNull(),
  detail: text("detail").notNull().default(""),
  occurredAt: text("occurred_at"),
  occurredPrecision: text("occurred_precision").notNull().default("unknown"),
  basis: text("basis").notNull().default("stated"),
  confidence: text("confidence").notNull().default("low"),
  status: text("status").notNull().default("candidate"),
  sensitivity: text("sensitivity").notNull().default("normal"),
  sourceConversationId: text("source_conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  sourceRole: text("source_role").notNull().default("user"),
  threadId: text("thread_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("memory_dedupe_idx").on(table.ownerId, table.kind, table.statementKey),
  index("memories_owner_idx").on(table.ownerId),
  index("memories_kind_idx").on(table.kind),
  index("memories_time_idx").on(table.occurredAt),
  index("memories_status_idx").on(table.status),
]);

// 证据：一条记忆可以有多段证据，来自同一段或不同对话。
export const memoryEvidence = sqliteTable("memory_evidence", {
  id: text("id").primaryKey(),
  memoryId: text("memory_id").notNull().references(() => memories.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  quote: text("quote").notNull(),
  charStart: text("char_start"),
  charEnd: text("char_end"),
  speakerRole: text("speaker_role").notNull().default("user"),
  createdAt: text("created_at").notNull(),
}, table => [index("evidence_memory_idx").on(table.memoryId), index("evidence_conversation_idx").on(table.conversationId)]);

// 修订史：推翻也要留痕。
export const memoryRevisions = sqliteTable("memory_revisions", {
  id: text("id").primaryKey(),
  memoryId: text("memory_id").notNull().references(() => memories.id, { onDelete: "cascade" }),
  beforeJson: text("before_json").notNull(),
  afterJson: text("after_json").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, table => [index("revisions_memory_idx").on(table.memoryId)]);

// L2 线索：记忆的归属容器，为下一阶段的主题聚合预留。
export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  status: text("status").notNull().default("active"),
  startedAt: text("started_at"),
  updatedAt: text("updated_at").notNull(),
}, table => [index("threads_owner_idx").on(table.ownerId), index("threads_domain_idx").on(table.domain)]);

export const memoryExtractions = sqliteTable("memory_extractions", {
  conversationId: text("conversation_id").primaryKey().references(() => conversations.id, {onDelete:"cascade"}),
  ownerId: text("owner_id").notNull(),
  extractedAt: text("extracted_at").notNull(),
});
