CREATE TABLE "chat_diagnostic_events" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"session_id" text NOT NULL,
	"workflow_run_id" text,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_diagnostic_events_chat_created_idx" ON "chat_diagnostic_events" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_diagnostic_events_run_idx" ON "chat_diagnostic_events" USING btree ("workflow_run_id");