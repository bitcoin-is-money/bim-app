ALTER TABLE "bim_swaps" ADD COLUMN "last_claim_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "bim_swaps" ADD COLUMN "last_claim_tx_hash" text;