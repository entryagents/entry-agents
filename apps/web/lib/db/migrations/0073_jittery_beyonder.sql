CREATE TABLE "user_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"encrypted_value" text NOT NULL,
	"masked_hint" text NOT NULL,
	"allowed_hosts" jsonb,
	"inject_in_sandbox" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "command" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "args" jsonb;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "encrypted_env" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "last_tool_count" integer;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "cached_tools" jsonb;--> statement-breakpoint
ALTER TABLE "user_secrets" ADD CONSTRAINT "user_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_secrets_user_id_idx" ON "user_secrets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_secrets_user_id_name_idx" ON "user_secrets" USING btree ("user_id","name");