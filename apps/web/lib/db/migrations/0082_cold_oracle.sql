CREATE TABLE "email_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_message_id" text,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_logs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE INDEX "email_logs_user_created_idx" ON "email_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_logs_template_created_idx" ON "email_logs" USING btree ("template","created_at");