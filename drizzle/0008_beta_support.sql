CREATE TABLE `support_diagnostics` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_key` text NOT NULL,
	`bucket` text NOT NULL,
	`code` text NOT NULL,
	`app` text NOT NULL,
	`severity` text NOT NULL,
	`source` text NOT NULL,
	`release` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`metadata` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_support_diagnostics_seen` ON `support_diagnostics` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_support_diagnostics_actor_bucket` ON `support_diagnostics` (`actor_key`,`bucket`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`app` text NOT NULL,
	`impact` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`reporter` text NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_tickets_id_unique` ON `support_tickets` (`id`);--> statement-breakpoint
CREATE INDEX `idx_support_tickets_reporter_created` ON `support_tickets` (`reporter`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_support_tickets_updated` ON `support_tickets` (`updated_at`);