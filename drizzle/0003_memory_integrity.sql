CREATE TABLE `model_operations` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL
);

--> statement-breakpoint
UPDATE memories SET statement_key = lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(statement, char(32), ''), char(9), ''), char(13), ''), char(10), ''), char(12288), ''), char(160), ''), char(65292), ''), char(12290), ''), char(12289), ''), char(65307), ''), char(65306), ''), char(44), ''), char(59), ''), char(58), ''), char(34), ''), char(8220), ''), char(8221), ''), char(8216), ''), char(8217), ''), char(65288), ''), char(65289), ''), char(40), ''), char(41), ''), char(12298), ''), char(12299), ''), char(12296), ''), char(12297), ''), char(12304), ''), char(12305), ''), char(91), ''), char(93), ''), char(123), ''), char(125), ''), char(8230), ''), char(183), '')) || '|date:' || COALESCE(occurred_at,'') || '|role:' || source_role;
