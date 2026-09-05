CREATE TABLE "rate_counters" (
	"bucket" text NOT NULL,
	"subject" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_secs" integer NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"first_hit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_hit_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_counters_bucket_subject_window_start_pk" PRIMARY KEY("bucket","subject","window_start")
) WITH (fillfactor = 70);
--> statement-breakpoint
CREATE INDEX "rate_counters_sweep_idx" ON "rate_counters" USING btree ("window_start");