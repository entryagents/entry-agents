CREATE TABLE "compaction_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"session_id" text,
	"summary_text" text NOT NULL,
	"compacted_up_to_message_count" integer NOT NULL,
	"compacted_up_to_message_id" text,
	"pre_tokens" integer NOT NULL,
	"post_tokens" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compaction_checkpoints" ADD CONSTRAINT "compaction_checkpoints_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compaction_checkpoints" ADD CONSTRAINT "compaction_checkpoints_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compaction_checkpoints_chat_created_idx" ON "compaction_checkpoints" USING btree ("chat_id","created_at");--> statement-breakpoint
UPDATE "users" SET "plan" = 'entry' WHERE "plan" = 'goat';