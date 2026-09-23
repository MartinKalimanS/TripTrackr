CREATE TABLE `cities` (
	`id` integer PRIMARY KEY NOT NULL,
	`country_id` integer NOT NULL,
	`name` text NOT NULL,
	`ascii_name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`timezone` text NOT NULL,
	`population` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cities_country_ascii_idx` ON `cities` (`country_id`,`ascii_name`);--> statement-breakpoint
CREATE TABLE `countries` (
	`id` integer PRIMARY KEY NOT NULL,
	`iso_code` text NOT NULL,
	`name` text NOT NULL,
	`continent` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`trip_id` text NOT NULL,
	`type` text NOT NULL,
	`parsed_json` text,
	`parsed_confirmed_at` text,
	`upload_state` text DEFAULT 'pending' NOT NULL,
	`is_dirty` integer DEFAULT true NOT NULL,
	`synced_at` text,
	`local_file_uri` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_trip_idx` ON `documents` (`trip_id`);--> statement-breakpoint
CREATE INDEX `documents_updated_at_idx` ON `documents` (`updated_at`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`name` text NOT NULL,
	`icon` text,
	`is_dirty` integer DEFAULT true NOT NULL,
	`synced_at` text
);
--> statement-breakpoint
CREATE INDEX `expense_categories_updated_at_idx` ON `expense_categories` (`updated_at`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`trip_id` text NOT NULL,
	`city_id` integer,
	`category_id` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`spent_at` text NOT NULL,
	`note` text,
	`fx_rate_to_home` text,
	`amount_home` text,
	`fx_pending` integer DEFAULT false NOT NULL,
	`is_dirty` integer DEFAULT true NOT NULL,
	`synced_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expenses_trip_idx` ON `expenses` (`trip_id`);--> statement-breakpoint
CREATE INDEX `expenses_updated_at_idx` ON `expenses` (`updated_at`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`trip_id` text NOT NULL,
	`country_id` integer,
	`city_id` integer,
	`title` text,
	`body` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`is_dirty` integer DEFAULT true NOT NULL,
	`synced_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_trip_idx` ON `notes` (`trip_id`);--> statement-breakpoint
CREATE INDEX `notes_updated_at_idx` ON `notes` (`updated_at`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`trip_id` text NOT NULL,
	`city_id` integer,
	`taken_at` text,
	`exif_lat` real,
	`exif_lng` real,
	`is_public` integer DEFAULT false NOT NULL,
	`upload_state` text DEFAULT 'pending' NOT NULL,
	`moderation_state` text DEFAULT 'pending' NOT NULL,
	`has_thumbnail` integer DEFAULT false NOT NULL,
	`is_dirty` integer DEFAULT true NOT NULL,
	`synced_at` text,
	`local_file_uri` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_trip_idx` ON `photos` (`trip_id`);--> statement-breakpoint
CREATE INDEX `photos_updated_at_idx` ON `photos` (`updated_at`);--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`table_name` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trip_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`trip_id` text NOT NULL,
	`city_id` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`arrive_date` text NOT NULL,
	`depart_date` text NOT NULL,
	`is_dirty` integer DEFAULT true NOT NULL,
	`synced_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trip_stops_trip_sort_idx` ON `trip_stops` (`trip_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `trip_stops_updated_at_idx` ON `trip_stops` (`updated_at`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`title` text NOT NULL,
	`home_currency` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`cover_photo_id` text,
	`status` text DEFAULT 'planning' NOT NULL,
	`is_dirty` integer DEFAULT true NOT NULL,
	`synced_at` text
);
--> statement-breakpoint
CREATE INDEX `trips_updated_at_idx` ON `trips` (`updated_at`);