CREATE TABLE `billing_profiles` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`trade_name` text NOT NULL,
	`address` text NOT NULL,
	`postal_code` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`chamber_of_commerce` text NOT NULL,
	`vat_id` text NOT NULL,
	`iban` text NOT NULL,
	`bic` text,
	`email` text NOT NULL,
	`phone` text,
	`website` text,
	`payment_term_days` integer NOT NULL,
	`default_vat_rate` integer NOT NULL,
	`invoice_prefix` text NOT NULL,
	`next_number` integer NOT NULL,
	`fiscal_scheme` text NOT NULL,
	`logo_storage_key` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `communication_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`customer_visible` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `communication_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `communication_message_thread_time_idx` ON `communication_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `communication_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`created_by` text NOT NULL,
	`subject` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`assignee` text,
	`priority` text DEFAULT 'Normaal' NOT NULL,
	`deadline` text,
	`archived` integer DEFAULT false NOT NULL,
	`idempotency_key` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `communication_org_status_idx` ON `communication_threads` (`organization_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `communication_idempotency_unique` ON `communication_threads` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `debtors` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`display_name` text NOT NULL,
	`address` text NOT NULL,
	`postal_code` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`email` text NOT NULL,
	`customer_number` text NOT NULL,
	`payment_term_days` integer NOT NULL,
	`vat_treatment` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `debtors_org_archived_idx` ON `debtors` (`organization_id`,`archived`);--> statement-breakpoint
CREATE UNIQUE INDEX `debtors_org_customer_number_unique` ON `debtors` (`organization_id`,`customer_number`);--> statement-breakpoint
CREATE TABLE `file_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `file_assets_owner_idx` ON `file_assets` (`organization_id`,`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `invoice_number_sequences` (
	`organization_id` text NOT NULL,
	`year` integer NOT NULL,
	`next_number` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_sequence_org_year_unique` ON `invoice_number_sequences` (`organization_id`,`year`);--> statement-breakpoint
CREATE TABLE `professional_invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_minor` integer NOT NULL,
	`unit` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`discount_basis_points` integer DEFAULT 0 NOT NULL,
	`vat_rate_basis_points` integer NOT NULL,
	`category` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `professional_invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `professional_invoice_lines_invoice_idx` ON `professional_invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `professional_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`debtor_id` text NOT NULL,
	`number` text,
	`invoice_date` text NOT NULL,
	`due_date` text NOT NULL,
	`reference` text,
	`status` text NOT NULL,
	`paid_cents` integer DEFAULT 0 NOT NULL,
	`finalized_at` text,
	`sent_at` text,
	`original_invoice_id` text,
	`accounting_status` text NOT NULL,
	`pdf_storage_key` text,
	`immutable_snapshot` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debtor_id`) REFERENCES `debtors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_org_number_unique` ON `professional_invoices` (`organization_id`,`number`);--> statement-breakpoint
CREATE INDEX `invoice_org_status_date_idx` ON `professional_invoices` (`organization_id`,`status`,`invoice_date`);--> statement-breakpoint
CREATE INDEX `invoice_debtor_idx` ON `professional_invoices` (`debtor_id`);