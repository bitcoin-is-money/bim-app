-- Add columns required for secure WebAuthn verification
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "credential_public_key" text,
  ADD COLUMN IF NOT EXISTS "webauthn_sign_count" bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rp_id" text;

-- Create table to store short-lived, single-use WebAuthn challenges
CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "challenge" text NOT NULL,
  "purpose" text NOT NULL,
  "user_id" uuid,
  "rp_id" text,
  "origin" text,
  "used" boolean DEFAULT false NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "webauthn_challenges_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action
);
