CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`scrollback` text,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`project_path` text NOT NULL,
	`tmux_session` text NOT NULL,
	`shell` text NOT NULL,
	`autonomous` integer DEFAULT true NOT NULL,
	`initial_prompt` text,
	`preview_port` integer,
	`created_at` integer NOT NULL,
	`last_accessed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_name_unique` ON `sessions` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`runner_type` text DEFAULT 'ralph' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`current_iteration` integer DEFAULT 0 NOT NULL,
	`max_iterations` integer DEFAULT 10 NOT NULL,
	`verification_prompt` text,
	`last_verification_result` text,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);