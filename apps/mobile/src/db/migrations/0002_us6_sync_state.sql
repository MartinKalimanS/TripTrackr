CREATE TABLE `sync_parked` (
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`parked_updated_at` text NOT NULL,
	`reason` text NOT NULL,
	`parked_at` text NOT NULL,
	PRIMARY KEY(`table_name`, `record_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
