CREATE TABLE `suite_calendar_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`color` text DEFAULT '#75ff47' NOT NULL,
	`sync_minutes` integer DEFAULT 15 NOT NULL,
	`last_synced` text,
	`last_error` text,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suite_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`event_time` text DEFAULT '' NOT NULL,
	`rental_time` text DEFAULT '' NOT NULL,
	`space` text DEFAULT '' NOT NULL,
	`manager` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`attendees` integer DEFAULT 0 NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`planning_notes` text DEFAULT '' NOT NULL,
	`mod` text DEFAULT '' NOT NULL,
	`vacation` text DEFAULT '' NOT NULL,
	`rental_total` real DEFAULT 0 NOT NULL,
	`catering_total` real DEFAULT 0 NOT NULL,
	`discount_rate` real DEFAULT 0 NOT NULL,
	`deposit` real DEFAULT 0 NOT NULL,
	`payment_notes` text DEFAULT '' NOT NULL,
	`quote_entered_by` text DEFAULT '' NOT NULL,
	`requested_items` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_events_date` ON `suite_events` (`date`);
--> statement-breakpoint
CREATE INDEX `idx_suite_events_kind` ON `suite_events` (`kind`);
--> statement-breakpoint
CREATE TABLE `suite_layout_items` (
	`id` text PRIMARY KEY NOT NULL,
	`layout_id` text NOT NULL,
	`event_id` text,
	`item_type` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_layout_items_layout_id` ON `suite_layout_items` (`layout_id`);
--> statement-breakpoint
CREATE INDEX `idx_suite_layout_items_event_id` ON `suite_layout_items` (`event_id`);
--> statement-breakpoint
CREATE TABLE `suite_recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_servings` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suite_room_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_room_layouts_room_id` ON `suite_room_layouts` (`room_id`);
--> statement-breakpoint
CREATE TABLE `suite_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`width` real DEFAULT 26 NOT NULL,
	`height` real DEFAULT 26 NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suite_schedule_items` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`start` text DEFAULT '' NOT NULL,
	`end` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_schedule_items_event_id` ON `suite_schedule_items` (`event_id`);
--> statement-breakpoint
CREATE TABLE `suite_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suite_shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`recipe_id` text,
	`ingredient` text NOT NULL,
	`store` text DEFAULT '' NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`estimated_cost` real DEFAULT 0 NOT NULL,
	`purchased` integer DEFAULT false NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_shopping_items_meal_id` ON `suite_shopping_items` (`meal_id`);
--> statement-breakpoint
CREATE INDEX `idx_suite_shopping_items_recipe_id` ON `suite_shopping_items` (`recipe_id`);
