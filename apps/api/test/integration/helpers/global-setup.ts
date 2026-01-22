import {PostgreSqlContainer, type StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import pg, {Pool} from 'pg';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import type { TestProject } from 'vitest/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup(_ctx: TestProject) {
  console.log('🔧 Global setup');
  const container: StartedPostgreSqlContainer = await startDatabaseContainer();
  return async () => {
    console.log('🧹 Global teardown');
    await stopDatabaseContainer(container);
  };
}

async function startDatabaseContainer(): Promise<StartedPostgreSqlContainer> {
  console.log('\n🐘 Starting PostgreSQL container...');

  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start();
  const connectionString: string = container.getConnectionUri();
  const pool = new pg.Pool({connectionString});
  console.log(`✓ PostgreSQL container started at ${connectionString}`);

  // Set environment variable for the tests
  process.env.DATABASE_URL = connectionString;

  const migrationsFolder: string = path.resolve(__dirname, '../../database/drizzle');
  if (await hasMigrations(migrationsFolder)) {
    await runMigrations(pool, migrationsFolder);
  } else {
    console.log('∅ No migrations found, creating tables from schema...');
    await createTablesFromSchema(pool);
    console.log('✓ Tables created from schema');
  }
  await pool.end();
  return container;
}

async function hasMigrations(migrationsFolder: string): Promise<boolean> {
  try {
    const files = await fs.readdir(migrationsFolder, { withFileTypes: true });
    return files.some(f => {
      const acceptedExt: boolean = f.name.endsWith('.sql') || f.name.endsWith('.ts');
      return f.isFile() && acceptedExt;
    });
  } catch {
    return false;
  }
}

async function runMigrations(
  pool: Pool,
  migrationsFolder: string
): Promise<void> {
  console.log('📦 Applying migrations...');
  const db = drizzle(pool);
  try {
    await migrate(db, {migrationsFolder});
    console.log('✓ Migrations applied successfully');
  } catch (error) {
    console.log("✖ Error during migration: ", error);
  }
}

async function createTablesFromSchema(pool: pg.Pool): Promise<void> {
  // Create tables manually if no migrations exist yet
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      credential_public_key TEXT,
      starknet_address TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      deployment_tx_hash TEXT,
      sign_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id UUID PRIMARY KEY,
      challenge TEXT NOT NULL,
      purpose TEXT NOT NULL,
      account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
      rp_id TEXT,
      origin TEXT,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function stopDatabaseContainer(
  container: StartedPostgreSqlContainer
): Promise<void> {
  console.log('🛑 Stopping PostgreSQL container...');
  if (container) {
    await container.stop();
    console.log('✓ PostgreSQL container stopped');
  }
}
