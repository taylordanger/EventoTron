CREATE TABLE `suite_calendar_oauth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`connected_by_email` text NOT NULL,
	`account_email` text DEFAULT '' NOT NULL,
	`access_token_ciphertext` text DEFAULT '' NOT NULL,
	`refresh_token_ciphertext` text DEFAULT '' NOT NULL,
	`token_iv` text DEFAULT '' NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`expires_at` text,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suite_calendar_oauth_accounts_provider` ON `suite_calendar_oauth_accounts` (`provider`);--> statement-breakpoint
CREATE TABLE `suite_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_at` text,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_suite_users_email` ON `suite_users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_suite_users_role` ON `suite_users` (`role`);