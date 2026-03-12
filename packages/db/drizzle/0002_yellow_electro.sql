ALTER TABLE "bim_challenges" ALTER COLUMN "account_id" SET DATA TYPE uuid USING account_id::uuid;--> statement-breakpoint
ALTER TABLE "bim_swaps" ALTER COLUMN "account_id" SET DATA TYPE uuid USING account_id::uuid;--> statement-breakpoint
ALTER TABLE "bim_swaps" ADD CONSTRAINT "bim_swaps_account_id_bim_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bim_accounts"("id") ON DELETE cascade ON UPDATE no action;
