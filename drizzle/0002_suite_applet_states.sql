CREATE TABLE `suite_applet_states` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`app_name` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_applet_states_event_id` ON `suite_applet_states` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_suite_applet_states_app_name` ON `suite_applet_states` (`app_name`);