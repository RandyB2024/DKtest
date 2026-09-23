CREATE TABLE `active_organization_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`action` text NOT NULL,
	`timestamp` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text NOT NULL,
	`result` text NOT NULL,
	`change` text,
	`session_info` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_org_time_idx` ON `audit_events` (`organization_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_user_time_idx` ON `audit_events` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `invitation_memberships` (
	`invitation_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`permissions` text,
	`valid_until` text,
	FOREIGN KEY (`invitation_id`) REFERENCES `user_invitations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_org_unique` ON `invitation_memberships` (`invitation_id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`group_name` text NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_code_unique` ON `permissions` (`code`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_permission_unique` ON `role_permissions` (`role_id`,`permission_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`organization_id` text,
	`is_system` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `roles_org_idx` ON `roles` (`organization_id`);--> statement-breakpoint
CREATE TABLE `user_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`function_title` text,
	`status` text NOT NULL,
	`invited_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`invited_by` text NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invitations_email_status_idx` ON `user_invitations` (`email`,`status`);--> statement-breakpoint
ALTER TABLE `memberships` ADD `role_id` text REFERENCES roles(id);--> statement-breakpoint
ALTER TABLE `memberships` ADD `created_at` text DEFAULT '1970-01-01' NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `created_by` text DEFAULT 'system' NOT NULL REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `memberships` ADD `valid_from` text DEFAULT '1970-01-01' NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `valid_until` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `additional_permissions` text;--> statement-breakpoint
CREATE INDEX `memberships_validity_idx` ON `memberships` (`valid_from`,`valid_until`);--> statement-breakpoint
ALTER TABLE `users` ADD `function_title` text;--> statement-breakpoint
ALTER TABLE `users` ADD `account_status` text DEFAULT 'Uitgenodigd' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login` text;