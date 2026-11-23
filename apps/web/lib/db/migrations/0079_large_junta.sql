CREATE TABLE "workflow_run_telemetry" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text,
	"segment_index" integer DEFAULT 0 NOT NULL,
	"llm_steps" integer DEFAULT 0 NOT NULL,
	"total_step_calls" integer DEFAULT 0 NOT NULL,
	"estimated_events" integer DEFAULT 0 NOT NULL,
	"retry_recoveries" integer DEFAULT 0 NOT NULL,
	"total_serialized_bytes" integer DEFAULT 0 NOT NULL,
	"max_step_input_bytes" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"finish_reason" text DEFAULT 'unknown' NOT NULL,
	"step_counts_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "workflow_run_telemetry_created_idx" ON "workflow_run_telemetry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_run_telemetry_user_created_idx" ON "workflow_run_telemetry" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_run_telemetry_chat_idx" ON "workflow_run_telemetry" USING btree ("chat_id");