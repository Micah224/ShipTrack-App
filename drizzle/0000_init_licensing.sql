CREATE TYPE "public"."activation_environment" AS ENUM('PRODUCTION', 'STAGING', 'DEVELOPMENT', 'LOCAL');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."license_tier" AS ENUM('STARTER', 'PROFESSIONAL', 'ENTERPRISE');--> statement-breakpoint
CREATE TYPE "public"."activation_release_reason" AS ENUM('SELF_SERVICE', 'AUTO_RECLAIM', 'ADMIN', 'SUPERSEDED');--> statement-breakpoint
CREATE TABLE "activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" uuid NOT NULL,
	"install_id" text NOT NULL,
	"domain" text NOT NULL,
	"site_url" text NOT NULL,
	"ip_address" text,
	"plugin_version" text NOT NULL,
	"wp_version" text,
	"php_version" text,
	"active_map_provider" text,
	"transport_modes_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"environment" "activation_environment" DEFAULT 'PRODUCTION' NOT NULL,
	"counts_seat" boolean DEFAULT true NOT NULL,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"seat_claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" "activation_release_reason"
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" uuid,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "download_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"license_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "download_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"key_cipher" text NOT NULL,
	"key_prefix" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text,
	"tier" "license_tier" DEFAULT 'STARTER' NOT NULL,
	"max_seats" integer DEFAULT 1 NOT NULL,
	"status" "license_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone,
	"grace_period_days" integer DEFAULT 7 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limits" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag" text NOT NULL,
	"version" text NOT NULL,
	"min_php" text DEFAULT '8.1' NOT NULL,
	"min_wp" text DEFAULT '6.5' NOT NULL,
	"tested_up_to" text DEFAULT '7.0' NOT NULL,
	"changelog" text NOT NULL,
	"changelog_html" text,
	"r2_storage_key" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_sha256" text NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_tag_unique" UNIQUE("tag"),
	CONSTRAINT "releases_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "activations" ADD CONSTRAINT "activations_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_tokens" ADD CONSTRAINT "download_tokens_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_tokens" ADD CONSTRAINT "download_tokens_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activation_install_unique" ON "activations" USING btree ("license_id","install_id");--> statement-breakpoint
CREATE INDEX "activation_domain_idx" ON "activations" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "activation_seat_idx" ON "activations" USING btree ("license_id","released_at","counts_seat");--> statement-breakpoint
CREATE INDEX "activation_claim_idx" ON "activations" USING btree ("license_id","seat_claimed_at");--> statement-breakpoint
CREATE INDEX "activation_heartbeat_idx" ON "activations" USING btree ("last_heartbeat");--> statement-breakpoint
CREATE INDEX "audit_license_idx" ON "audit_logs" USING btree ("license_id","created_at");--> statement-breakpoint
CREATE INDEX "download_token_expiry_idx" ON "download_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "license_hash_status_idx" ON "licenses" USING btree ("key_hash","status");--> statement-breakpoint
CREATE INDEX "license_prefix_idx" ON "licenses" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "license_customer_idx" ON "licenses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "release_published_idx" ON "releases" USING btree ("published_at");