CREATE TABLE `foodotron_meals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`guests` integer NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`tabletron_event_id` text,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tabletron_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`guest_count` integer NOT NULL,
	`foodotron_meal_id` text,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`foodotron_meal_id` text NOT NULL,
	`tabletron_event_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`claimed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_meal_transfers_foodotron_meal_id` ON `meal_transfers` (`foodotron_meal_id`);
--> statement-breakpoint
CREATE INDEX `idx_meal_transfers_tabletron_event_id` ON `meal_transfers` (`tabletron_event_id`);
