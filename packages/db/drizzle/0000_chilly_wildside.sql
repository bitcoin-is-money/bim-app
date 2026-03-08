CREATE TABLE "bim_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"credential_public_key" text,
	"starknet_address" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"deployment_tx_hash" text,
	"sign_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bim_accounts_username_unique" UNIQUE("username"),
	CONSTRAINT "bim_accounts_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "bim_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"purpose" text NOT NULL,
	"rp_id" text,
	"origin" text,
	"used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bim_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bim_swaps" (
	"id" text PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"amount_sats" text NOT NULL,
	"destination_address" text NOT NULL,
	"source_address" text,
	"invoice" text,
	"deposit_address" text,
	"description" text NOT NULL,
	"account_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"error_message" text,
	"paid_at" timestamp,
	"confirmed_at" timestamp,
	"completed_at" timestamp,
	"expired_at" timestamp,
	"refunded_at" timestamp,
	"lost_at" timestamp,
	"failed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bim_transaction_descriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bim_transaction_descriptions_hash_account_unique" UNIQUE("transaction_hash","account_id")
);
--> statement-breakpoint
CREATE TABLE "bim_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"transaction_hash" text NOT NULL,
	"block_number" text NOT NULL,
	"transaction_type" text NOT NULL,
	"amount" text NOT NULL,
	"token_address" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bim_transactions_hash_account_unique" UNIQUE("transaction_hash","account_id")
);
--> statement-breakpoint
CREATE TABLE "bim_user_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"preferred_currencies" text DEFAULT 'USD' NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bim_user_settings_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "bim_sessions" ADD CONSTRAINT "bim_sessions_account_id_bim_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bim_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bim_transaction_descriptions" ADD CONSTRAINT "bim_transaction_descriptions_account_id_bim_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bim_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bim_transactions" ADD CONSTRAINT "bim_transactions_account_id_bim_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bim_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bim_user_settings" ADD CONSTRAINT "bim_user_settings_account_id_bim_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bim_accounts"("id") ON DELETE cascade ON UPDATE no action;