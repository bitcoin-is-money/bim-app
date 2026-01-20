-- Aux indexes to support auth lookups and challenge cleanup

-- Speed up session joins on user_id
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON "sessions" ("user_id");

-- Speed up challenge cleanup queries
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_used_expires ON "webauthn_challenges" ("used", "expires_at");

