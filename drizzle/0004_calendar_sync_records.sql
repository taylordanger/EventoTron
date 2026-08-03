CREATE TABLE `suite_calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`event_time` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_calendar_events_source_id` ON `suite_calendar_events` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_suite_calendar_events_date` ON `suite_calendar_events` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_suite_calendar_events_source_external` ON `suite_calendar_events` (`source_id`,`external_id`);