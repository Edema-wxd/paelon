-- Extensions. Prepended by hand: drizzle-kit does not emit these, and
-- gen_random_uuid() below needs pgcrypto on Postgres < 13 (it is core from 13
-- onward, so this is belt-and-braces). pg_trgm backs the HMO typeahead index
-- added in 0001.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TYPE "public"."blog_category" AS ENUM('seasonal_alerts', 'family_health', 'women_and_children', 'corporate_wellness');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('website', 'phone', 'walk_in', 'referral');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('new', 'contacted', 'confirmed', 'completed', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."company_size" AS ENUM('1_50', '51_200', '201_500', '501_1000', '1000_plus');--> statement-breakpoint
CREATE TYPE "public"."corporate_status" AS ENUM('new', 'contacted', 'proposal_sent', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."faq_category" AS ENUM('general', 'booking', 'services', 'insurance', 'emergencies');--> statement-breakpoint
CREATE TYPE "public"."name_format" AS ENUM('full', 'first_only', 'initials');--> statement-breakpoint
CREATE TYPE "public"."service_family" AS ENUM('family_healthcare', 'women_and_children', 'specialist', 'diagnostics');--> statement-breakpoint
CREATE TYPE "public"."time_window" AS ENUM('morning', 'afternoon', 'evening');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'contributor');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"role" text NOT NULL,
	"bio" text NOT NULL,
	"headshot" text,
	"doctor_id" uuid
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"awarding_body" text NOT NULL,
	"year" integer NOT NULL,
	"description" text NOT NULL,
	"logo" text,
	"certificate_image" text,
	"external_link" text
);
--> statement-breakpoint
CREATE TABLE "blog_post_related" (
	"post_id" uuid NOT NULL,
	"related_id" uuid NOT NULL,
	CONSTRAINT "blog_post_related_post_id_related_id_pk" PRIMARY KEY("post_id","related_id")
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text NOT NULL,
	"body" text NOT NULL,
	"hero_image" text,
	"author_id" uuid NOT NULL,
	"category" "blog_category" NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "booking_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"changed_by_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"location_id" uuid NOT NULL,
	"service_family" "service_family" NOT NULL,
	"service_id" uuid,
	"preferred_date" date NOT NULL,
	"preferred_time_window" time_window NOT NULL,
	"patient_name" text,
	"patient_phone" text,
	"patient_email" text,
	"patient_dob" date,
	"existing_patient" boolean DEFAULT false NOT NULL,
	"reason_for_visit" text,
	"hmo_id" uuid,
	"hmo_plan" text,
	"consent_ndpr" boolean NOT NULL,
	"consent_text_version" text NOT NULL,
	"consent_given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_marketing" boolean DEFAULT false NOT NULL,
	"status" "booking_status" DEFAULT 'new' NOT NULL,
	"assigned_to_user_id" uuid,
	"internal_notes" text,
	"source" "booking_source" DEFAULT 'website' NOT NULL,
	"anonymised_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"subject" text NOT NULL,
	"message" text,
	"location_id" uuid,
	"consent_ndpr" boolean NOT NULL,
	"consent_text_version" text NOT NULL,
	"consent_given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled" boolean DEFAULT false NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"anonymised_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corporate_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"company_size" "company_size" NOT NULL,
	"sector" text NOT NULL,
	"current_provider" text,
	"requirements" text NOT NULL,
	"consent_ndpr" boolean NOT NULL,
	"consent_text_version" text NOT NULL,
	"consent_given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "corporate_status" DEFAULT 'new' NOT NULL,
	"anonymised_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_locations" (
	"doctor_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "doctor_locations_doctor_id_location_id_pk" PRIMARY KEY("doctor_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"qualifications" text[] DEFAULT '{}' NOT NULL,
	"years_experience" integer,
	"specialties" text[] DEFAULT '{}' NOT NULL,
	"languages_spoken" text[] DEFAULT '{}' NOT NULL,
	"bio" text NOT NULL,
	"headshot" text,
	"in_house" boolean DEFAULT true NOT NULL,
	"visiting" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"slug" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" "faq_category" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hmo_locations" (
	"hmo_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "hmo_locations_hmo_id_location_id_pk" PRIMARY KEY("hmo_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "hmos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"coverage_notes" text,
	"copay_applies" boolean DEFAULT false NOT NULL,
	"plan_notes" text,
	"aliases" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address_line_1" text NOT NULL,
	"address_line_2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"country" text DEFAULT 'Nigeria' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"phone" text NOT NULL,
	"whatsapp" text,
	"emergency_line" text NOT NULL,
	"hours" jsonb NOT NULL,
	"parking_info" text,
	"accessibility_notes" text,
	"hero_image" text,
	"gallery_images" text[] DEFAULT '{}' NOT NULL,
	"booking_email" text
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"consent_ndpr" boolean NOT NULL,
	"consent_text_version" text NOT NULL,
	"consent_given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"double_opt_in" boolean DEFAULT true NOT NULL,
	"confirm_token_hash" text,
	"confirm_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"unsubscribe_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"key" text NOT NULL,
	"hit_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_hits_key_hit_at_pk" PRIMARY KEY("key","hit_at")
);
--> statement-breakpoint
CREATE TABLE "service_locations" (
	"service_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "service_locations_service_id_location_id_pk" PRIMARY KEY("service_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "service_related" (
	"service_id" uuid NOT NULL,
	"related_id" uuid NOT NULL,
	CONSTRAINT "service_related_service_id_related_id_pk" PRIMARY KEY("service_id","related_id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"family" "service_family" NOT NULL,
	"short_description" text NOT NULL,
	"long_description" text NOT NULL,
	"who_its_for" text[] DEFAULT '{}' NOT NULL,
	"how_to_access" text[] DEFAULT '{}' NOT NULL,
	"typical_wait_time" text,
	"what_to_expect" text NOT NULL,
	"featured_image" text,
	"gallery_images" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"slug" text NOT NULL,
	"patient_name" text NOT NULL,
	"name_format" "name_format" DEFAULT 'full' NOT NULL,
	"avatar" text,
	"quote" text NOT NULL,
	"service_id" uuid,
	"location_id" uuid,
	"date_given" date NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"consent_given" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'contributor' NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_related" ADD CONSTRAINT "blog_post_related_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_related" ADD CONSTRAINT "blog_post_related_related_id_blog_posts_id_fk" FOREIGN KEY ("related_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hmo_id_hmos_id_fk" FOREIGN KEY ("hmo_id") REFERENCES "public"."hmos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_locations" ADD CONSTRAINT "doctor_locations_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_locations" ADD CONSTRAINT "doctor_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hmo_locations" ADD CONSTRAINT "hmo_locations_hmo_id_hmos_id_fk" FOREIGN KEY ("hmo_id") REFERENCES "public"."hmos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hmo_locations" ADD CONSTRAINT "hmo_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_related" ADD CONSTRAINT "service_related_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_related" ADD CONSTRAINT "service_related_related_id_services_id_fk" FOREIGN KEY ("related_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "authors_slug_key" ON "authors" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "blog_posts_category_idx" ON "blog_posts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "blog_posts_published_at_idx" ON "blog_posts" USING btree ("published_at" DESC NULLS LAST) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "booking_status_history_booking_id_idx" ON "booking_status_history" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_location_id_idx" ON "bookings" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "bookings_preferred_date_idx" ON "bookings" USING btree ("preferred_date");--> statement-breakpoint
CREATE INDEX "bookings_created_at_idx" ON "bookings" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookings_admin_filter_idx" ON "bookings" USING btree ("status","location_id","preferred_date");--> statement-breakpoint
CREATE INDEX "contact_submissions_handled_idx" ON "contact_submissions" USING btree ("handled");--> statement-breakpoint
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "corporate_enquiries_status_idx" ON "corporate_enquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "corporate_enquiries_created_at_idx" ON "corporate_enquiries" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "doctors_slug_key" ON "doctors" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "doctors_published_idx" ON "doctors" USING btree ("published") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "hmos_slug_key" ON "hmos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "hmos_published_idx" ON "hmos" USING btree ("published") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_slug_key" ON "locations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "locations_published_idx" ON "locations" USING btree ("published") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_confirm_token_key" ON "newsletter_subscribers" USING btree ("confirm_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_unsubscribe_token_key" ON "newsletter_subscribers" USING btree ("unsubscribe_token_hash");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_hit_at_idx" ON "rate_limit_hits" USING btree ("hit_at");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_key" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "services_family_idx" ON "services" USING btree ("family");--> statement-breakpoint
CREATE INDEX "services_published_idx" ON "services" USING btree ("published") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "testimonials_slug_key" ON "testimonials" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "testimonials_featured_idx" ON "testimonials" USING btree ("featured") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");