CREATE TABLE `claim_timeline_events` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`status` text NOT NULL,
	`public_message` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `insurance_claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `claim_timeline_claim_time_idx` ON `claim_timeline_events` (`claim_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `insurance_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`organization_id` text,
	`requested_by` text NOT NULL,
	`kind` text NOT NULL,
	`effective_date` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `insurance_change_org_status_idx` ON `insurance_change_requests` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `insurance_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`external_claim_number` text,
	`policy_id` text NOT NULL,
	`organization_id` text,
	`personal_user_id` text,
	`incident_at` text NOT NULL,
	`incident_type` text NOT NULL,
	`status` text NOT NULL,
	`handler` text,
	FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`personal_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `insurance_claim_reference_unique` ON `insurance_claims` (`reference`);--> statement-breakpoint
CREATE INDEX `insurance_claim_org_status_idx` ON `insurance_claims` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `insurance_claim_person_idx` ON `insurance_claims` (`personal_user_id`);--> statement-breakpoint
CREATE TABLE `insurance_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`personal_user_id` text,
	`policy_id` text,
	`claim_id` text,
	`subject` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`personal_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `insurance_claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `insurance_conversation_org_idx` ON `insurance_conversations` (`organization_id`);--> statement-breakpoint
CREATE INDEX `insurance_conversation_person_idx` ON `insurance_conversations` (`personal_user_id`);--> statement-breakpoint
CREATE TABLE `insurance_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`organization_id` text,
	`personal_user_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`document_date` text NOT NULL,
	`version` text NOT NULL,
	`storage_key` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`personal_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `insurance_document_policy_idx` ON `insurance_documents` (`policy_id`);--> statement-breakpoint
CREATE INDEX `insurance_document_org_idx` ON `insurance_documents` (`organization_id`);--> statement-breakpoint
CREATE TABLE `insurance_integration_links` (
	`id` text PRIMARY KEY NOT NULL,
	`relationship_id` text NOT NULL,
	`system` text NOT NULL,
	`external_id` text NOT NULL,
	`last_synchronized_at` text NOT NULL,
	FOREIGN KEY (`relationship_id`) REFERENCES `insurance_relationships`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `insurance_integration_external_unique` ON `insurance_integration_links` (`system`,`external_id`);--> statement-breakpoint
CREATE TABLE `insurance_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`external_source_id` text NOT NULL,
	`policy_number` text NOT NULL,
	`insurer_id` text NOT NULL,
	`organization_id` text,
	`personal_user_id` text,
	`product_type` text NOT NULL,
	`product_name` text NOT NULL,
	`status` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`contract_renewal_date` text,
	`payment_term` text NOT NULL,
	`premium_cents` integer,
	`source` text NOT NULL,
	`last_synchronized_at` text NOT NULL,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`personal_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `insurance_policy_external_unique` ON `insurance_policies` (`source`,`external_source_id`);--> statement-breakpoint
CREATE INDEX `insurance_policy_org_status_idx` ON `insurance_policies` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `insurance_policy_person_idx` ON `insurance_policies` (`personal_user_id`);--> statement-breakpoint
CREATE TABLE `insurance_referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`organization_id` text,
	`origin` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `insurance_referral_org_status_idx` ON `insurance_referrals` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `insurance_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`organization_id` text,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`external_relationship_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_until` text,
	`linked_at` text NOT NULL,
	`linked_by` text NOT NULL,
	`verified_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `insurance_relationship_org_status_idx` ON `insurance_relationships` (`organization_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `insurance_relationship_external_unique` ON `insurance_relationships` (`source`,`external_relationship_id`);--> statement-breakpoint
CREATE TABLE `insurers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emergency_phone` text
);
