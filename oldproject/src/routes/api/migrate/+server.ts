import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import postgres from 'postgres';

// Migration SQL content - direct execution for serverless compatibility
const migrationSQL = `
-- Create sessions table with integer user_id to match existing users.id
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Create users table (will be skipped if exists)
CREATE TABLE IF NOT EXISTS "users" (
	"id" integer PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_credential_id_unique" UNIQUE("credential_id")
);

-- Add missing columns to existing users table if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key text;

-- Fix sessions table user_id type if it's currently uuid
DO $$ 
BEGIN
    -- Check if sessions.user_id is uuid and change to integer
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sessions' 
        AND column_name = 'user_id' 
        AND data_type = 'uuid'
    ) THEN
        -- Drop the sessions table and recreate with correct type
        DROP TABLE IF EXISTS sessions;
        CREATE TABLE sessions (
            id text PRIMARY KEY NOT NULL,
            user_id integer NOT NULL,
            expires_at timestamp NOT NULL,
            created_at timestamp DEFAULT now() NOT NULL
        );
    END IF;
END $$;

-- Add unique constraint for credential_id if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_credential_id_unique' 
        AND table_name = 'users'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_credential_id_unique UNIQUE (credential_id);
    END IF;
END $$;

-- Create user_settings table for user preferences
CREATE TABLE IF NOT EXISTS "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fiat_currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);

-- Add foreign key constraint for user_settings if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_settings_user_id_users_id_fk' 
        AND table_name = 'user_settings'
    ) THEN
        ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_id_users_id_fk 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;
`;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { secret } = await request.json();

		const { DATABASE_URL, MIGRATION_SECRET } = process.env;

		// Simple secret check to prevent unauthorized migrations
		if (secret !== MIGRATION_SECRET) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (!DATABASE_URL) {
			return json({ error: 'DATABASE_URL not configured' }, { status: 500 });
		}

		console.log('🔄 Running database migrations...');
		console.log('Database URL configured:', DATABASE_URL ? 'Yes' : 'No');

		const client = postgres(DATABASE_URL, { max: 1 });

		try {
			// Test database connection
			await client.unsafe('SELECT 1');
			console.log('✅ Database connection successful');

			// Execute migration SQL directly for serverless compatibility
			console.log('Executing migration SQL statements...');
			console.log('Migration SQL:', migrationSQL);

			const result = await client.unsafe(migrationSQL);
			console.log('Migration result:', result);

			// Verify tables were created
			const tablesCheck = await client.unsafe(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('users', 'sessions', 'user_settings')
      `);
			console.log('Tables created:', tablesCheck);

			await client.end();

			console.log('✅ Database migrations completed successfully');

			return json({
				success: true,
				message: 'Database migrations completed successfully',
				tables_created: tablesCheck,
				timestamp: new Date().toISOString()
			});
		} catch (migrationError) {
			console.error('Migration execution error:', migrationError);
			await client.end();
			throw migrationError;
		}
	} catch (error) {
		console.error('❌ Database migration failed:', error);
		return json(
			{
				error: 'Database migration failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
