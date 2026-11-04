CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`statement` text NOT NULL,
	`statement_key` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`occurred_at` text,
	`occurred_precision` text DEFAULT 'unknown' NOT NULL,
	`basis` text DEFAULT 'stated' NOT NULL,
	`confidence` text DEFAULT 'low' NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`sensitivity` text DEFAULT 'normal' NOT NULL,
	`source_conversation_id` text,
	`source_role` text DEFAULT 'user' NOT NULL,
	`thread_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_dedupe_idx` ON `memories` (`owner_id`,`kind`,`statement_key`);--> statement-breakpoint
CREATE INDEX `memories_owner_idx` ON `memories` (`owner_id`);--> statement-breakpoint
CREATE INDEX `memories_kind_idx` ON `memories` (`kind`);--> statement-breakpoint
CREATE INDEX `memories_time_idx` ON `memories` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `memories_status_idx` ON `memories` (`status`);--> statement-breakpoint
CREATE TABLE `memory_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`quote` text NOT NULL,
	`char_start` text,
	`char_end` text,
	`speaker_role` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`memory_id`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `evidence_memory_idx` ON `memory_evidence` (`memory_id`);--> statement-breakpoint
CREATE INDEX `evidence_conversation_idx` ON `memory_evidence` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `memory_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`memory_id`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `revisions_memory_idx` ON `memory_revisions` (`memory_id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`domain` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `threads_owner_idx` ON `threads` (`owner_id`);--> statement-breakpoint
CREATE INDEX `threads_domain_idx` ON `threads` (`domain`);