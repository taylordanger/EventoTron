CREATE TABLE `suite_schema_migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_foodotron_meals_tabletron_event_id` ON `foodotron_meals` (`tabletron_event_id`);--> statement-breakpoint
CREATE INDEX `idx_foodotron_meals_updated_at` ON `foodotron_meals` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_meal_transfers_status_created_at` ON `meal_transfers` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_suite_applet_states_event_app` ON `suite_applet_states` (`event_id`,`app_name`);--> statement-breakpoint
CREATE INDEX `idx_suite_events_updated_at` ON `suite_events` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_suite_schedule_items_event_start` ON `suite_schedule_items` (`event_id`,`start`);--> statement-breakpoint
CREATE INDEX `idx_tabletron_events_foodotron_meal_id` ON `tabletron_events` (`foodotron_meal_id`);--> statement-breakpoint
CREATE INDEX `idx_tabletron_events_updated_at` ON `tabletron_events` (`updated_at`);--> statement-breakpoint
INSERT OR IGNORE INTO `suite_schema_migrations` (`id`, `applied_at`) VALUES
	('0000_suite_meal_transfers', datetime('now')),
	('0001_suite_production_tables', datetime('now')),
	('0002_suite_applet_states', datetime('now')),
	('0003_suite_integrity_indexes', datetime('now'));
