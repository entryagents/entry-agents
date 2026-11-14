CREATE TABLE IF NOT EXISTS "user_plugins" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"source" text DEFAULT 'custom' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"manifest" jsonb NOT NULL,
	"encrypted_config" text,
	"config_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_plugins" ADD CONSTRAINT "user_plugins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_plugins_user_id_idx" ON "user_plugins" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_plugins_user_id_slug_idx" ON "user_plugins" USING btree ("user_id","slug");