CREATE TABLE "composio_connected_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"composio_user_id" text NOT NULL,
	"connected_account_id" text NOT NULL,
	"toolkit_slug" text NOT NULL,
	"auth_config_id" text,
	"alias" text,
	"account_type" text DEFAULT 'PRIVATE' NOT NULL,
	"status" text DEFAULT 'INITIATED' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composio_oauth_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"state_nonce" text NOT NULL,
	"toolkit_slug" text NOT NULL,
	"connected_account_id" text,
	"alias" text,
	"account_type" text DEFAULT 'PRIVATE' NOT NULL,
	"chat_id" text,
	"session_id" text,
	"return_path" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composio_shared_account_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"connected_account_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"grantee_user_id" text NOT NULL,
	"toolkit_slug" text NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "composio_connected_accounts" ADD CONSTRAINT "composio_connected_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composio_oauth_attempts" ADD CONSTRAINT "composio_oauth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composio_shared_account_grants" ADD CONSTRAINT "composio_shared_account_grants_connected_account_id_composio_connected_accounts_connected_account_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."composio_connected_accounts"("connected_account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composio_shared_account_grants" ADD CONSTRAINT "composio_shared_account_grants_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composio_shared_account_grants" ADD CONSTRAINT "composio_shared_account_grants_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "composio_connected_accounts_user_toolkit_idx" ON "composio_connected_accounts" USING btree ("user_id","toolkit_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "composio_connected_accounts_account_id_idx" ON "composio_connected_accounts" USING btree ("connected_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "composio_oauth_attempts_state_nonce_idx" ON "composio_oauth_attempts" USING btree ("state_nonce");--> statement-breakpoint
CREATE INDEX "composio_oauth_attempts_user_id_idx" ON "composio_oauth_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "composio_shared_grants_account_grantee_idx" ON "composio_shared_account_grants" USING btree ("connected_account_id","grantee_user_id");--> statement-breakpoint
CREATE INDEX "composio_shared_grants_grantee_toolkit_idx" ON "composio_shared_account_grants" USING btree ("grantee_user_id","toolkit_slug");