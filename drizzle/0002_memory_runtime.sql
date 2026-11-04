CREATE TABLE `memory_extractions` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`extracted_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
