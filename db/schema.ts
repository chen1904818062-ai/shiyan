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
