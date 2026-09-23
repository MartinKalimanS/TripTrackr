CREATE TABLE "oauth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_uid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_info" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"bio" text,
	"home_currency" char(3) DEFAULT 'USD' NOT NULL,
	"is_profile_public" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deletion_requested_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"current_period_end" timestamp with time zone,
	"provider" text,
	"provider_customer_id" text,
	"entitlement_synced_at" timestamp with time zone,
	CONSTRAINT "subscriptions_provider_check" CHECK ("subscriptions"."provider" IS NULL OR "subscriptions"."provider" IN ('app_store', 'play_store'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"storage_key" text NOT NULL,
	"wrapped_dek" "bytea" NOT NULL,
	"dek_key_id" text NOT NULL,
	"parsed_json" jsonb,
	"parsed_confirmed_at" timestamp with time zone,
	"upload_state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_type_check" CHECK ("documents"."type" IN ('boarding_pass', 'booking', 'other')),
	CONSTRAINT "documents_upload_state_check" CHECK ("documents"."upload_state" IN ('pending', 'uploaded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"country_id" smallint,
	"city_id" integer,
	"title" text,
	"body" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "notes_anchor_check" CHECK ("notes"."country_id" IS NOT NULL OR "notes"."city_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"city_id" integer,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"taken_at" timestamp with time zone,
	"exif_lat" double precision,
	"exif_lng" double precision,
	"is_public" boolean DEFAULT false NOT NULL,
	"moderation_state" text DEFAULT 'pending' NOT NULL,
	"upload_state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "photos_moderation_state_check" CHECK ("photos"."moderation_state" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "photos_upload_state_check" CHECK ("photos"."upload_state" IN ('pending', 'uploaded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" smallint NOT NULL,
	"name" text NOT NULL,
	"ascii_name" text NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"timezone" text NOT NULL,
	"population" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"iso_code" char(2) NOT NULL,
	"name" text NOT NULL,
	"continent" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"city_id" integer NOT NULL,
	"sort_order" smallint NOT NULL,
	"arrive_date" date NOT NULL,
	"depart_date" date NOT NULL,
	CONSTRAINT "trip_stops_date_order_check" CHECK ("trip_stops"."depart_date" >= "trip_stops"."arrive_date")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"home_currency" char(3) NOT NULL,
	"cover_photo_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "trips_status_check" CHECK ("trips"."status" IN ('planning', 'active', 'past'))
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"icon" text,
	CONSTRAINT "expense_categories_user_name_key" UNIQUE NULLS NOT DISTINCT("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"city_id" integer,
	"category_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate_to_home" numeric(14, 6),
	"amount_home" numeric(12, 2),
	"fx_pending" boolean DEFAULT false NOT NULL,
	"spent_at" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"base_currency" char(3) NOT NULL,
	"quote_currency" char(3) NOT NULL,
	"rate" numeric(14, 6) NOT NULL,
	"as_of" date NOT NULL,
	CONSTRAINT "fx_rates_pkey" PRIMARY KEY("base_currency","quote_currency","as_of")
);
--> statement-breakpoint
CREATE TABLE "itinerary_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"city_id" integer NOT NULL,
	"day_date" date NOT NULL,
	CONSTRAINT "itinerary_days_trip_date_key" UNIQUE("trip_id","day_date")
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itinerary_day_id" uuid NOT NULL,
	"sort_order" smallint NOT NULL,
	"place_name" text NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"mapbox_place_id" text,
	"source" text DEFAULT 'ai_suggested' NOT NULL,
	"note" text,
	CONSTRAINT "itinerary_items_source_check" CHECK ("itinerary_items"."source" IN ('ai_suggested', 'user_added'))
);
--> statement-breakpoint
CREATE TABLE "planner_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cache_key" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"cost_tokens" integer DEFAULT 0,
	CONSTRAINT "planner_requests_status_check" CHECK ("planner_requests"."status" IN ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_pkey" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "blocks_not_self_check" CHECK ("blocks"."blocker_id" <> "blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_pkey" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "follows_not_self_check" CHECK ("follows"."follower_id" <> "follows"."followee_id"),
	CONSTRAINT "follows_status_check" CHECK ("follows"."status" IN ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_target_type_check" CHECK ("reports"."target_type" IN ('trip', 'note', 'photo', 'user')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" IN ('open', 'reviewed', 'dismissed', 'actioned'))
);
--> statement-breakpoint
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_itinerary_day_id_itinerary_days_id_fk" FOREIGN KEY ("itinerary_day_id") REFERENCES "public"."itinerary_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_requests" ADD CONSTRAINT "planner_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_identities_provider_uid_key" ON "oauth_identities" USING btree ("provider","provider_uid");--> statement-breakpoint
CREATE INDEX "oauth_identities_user_id_idx" ON "oauth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_key" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_public_idx" ON "users" USING btree ("is_profile_public");--> statement-breakpoint
CREATE INDEX "documents_trip_id_idx" ON "documents" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "documents_updated_at_idx" ON "documents" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "notes_trip_id_idx" ON "notes" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "notes_updated_at_idx" ON "notes" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "photos_trip_id_idx" ON "photos" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "photos_updated_at_idx" ON "photos" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "photos_pending_moderation_idx" ON "photos" USING btree ("moderation_state") WHERE "photos"."moderation_state" = 'pending';--> statement-breakpoint
CREATE INDEX "cities_country_id_idx" ON "cities" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "cities_location_gist" ON "cities" USING gist ("location");--> statement-breakpoint
CREATE INDEX "cities_ascii_name_trgm" ON "cities" USING gin ("ascii_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "countries_iso_code_key" ON "countries" USING btree ("iso_code");--> statement-breakpoint
CREATE INDEX "trip_stops_trip_id_sort_idx" ON "trip_stops" USING btree ("trip_id","sort_order");--> statement-breakpoint
CREATE INDEX "trips_owner_id_idx" ON "trips" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "trips_public_idx" ON "trips" USING btree ("is_public") WHERE "trips"."is_public";--> statement-breakpoint
CREATE INDEX "trips_updated_at_idx" ON "trips" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "expenses_trip_id_idx" ON "expenses" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "expenses_trip_category_idx" ON "expenses" USING btree ("trip_id","category_id");--> statement-breakpoint
CREATE INDEX "expenses_trip_spent_at_idx" ON "expenses" USING btree ("trip_id","spent_at");--> statement-breakpoint
CREATE INDEX "expenses_updated_at_idx" ON "expenses" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "fx_rates_as_of_idx" ON "fx_rates" USING btree ("as_of");--> statement-breakpoint
CREATE INDEX "itinerary_items_day_sort_idx" ON "itinerary_items" USING btree ("itinerary_day_id","sort_order");--> statement-breakpoint
CREATE INDEX "itinerary_items_location_gist" ON "itinerary_items" USING gist ("location");--> statement-breakpoint
CREATE INDEX "planner_requests_user_requested_idx" ON "planner_requests" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");