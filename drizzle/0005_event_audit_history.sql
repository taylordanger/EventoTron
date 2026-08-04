CREATE TABLE `suite_event_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`revision` text,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_event_audit_event_created` ON `suite_event_audit` (`event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_suite_event_audit_created_at` ON `suite_event_audit` (`created_at`);