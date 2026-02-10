import {PostgreSqlContainer, type StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import {drizzle, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {execSync} from "node:child_process";
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import * as schema from '@bim/db';

export type DbClient = NodePgDatabase<typeof schema>;

// ⚠ Be careful if you move this file, check __dirname usage below.
// This boilerplate is because Drizzle Kit doesn't work well with ESM.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiPath = path.resolve(__dirname, '../../..');
const projectPath = path.resolve(apiPath, '../..');
const migrationsFolder: string = path.resolve(apiPath, 'drizzle');
const configPath = path.join(apiPath, 'drizzle.config.ts');
const tsx = path.resolve(projectPath, 'node_modules/.bin/tsx');
const drizzleKit = path.resolve(projectPath, 'node_modules/drizzle-kit/bin.cjs');

export class TestDatabase {
  private readonly container: StartedPostgreSqlContainer;

  private constructor(
    container: StartedPostgreSqlContainer,
  ) {
    this.container = container;
  }

  static async create(): Promise<TestDatabase> {
    console.log('🐘 Starting PostgreSQL container...');
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();
    const connectionString = container.getConnectionUri();
    console.log(`✓ PostgreSQL container started at ${connectionString}`);
    process.env.DATABASE_URL = connectionString;
    const testDatabase: TestDatabase = new TestDatabase(container);
    await testDatabase.initialize(connectionString);
    return testDatabase;
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Stopping PostgreSQL container...');
    await this.container.stop().then(() => {
      console.log('✓ PostgreSQL container stopped');
    })
  }

  static createPool(): pg.Pool {
    return new pg.Pool({connectionString: process.env.DATABASE_URL});
  }

  static getClient(pool: pg.Pool): DbClient {
    return drizzle(pool, { schema });
  }

  static async reset(pool: pg.Pool): Promise<void> {
    const db = TestDatabase.getClient(pool);
    await db.delete(schema.transactions);
    await db.delete(schema.userSettings);
    await db.delete(schema.challenges);
    await db.delete(schema.sessions);
    await db.delete(schema.accounts);
  }

  private async initialize(connectionString: string): Promise<void> {
    if (await this.migrationsExist()) {
      await this.runMigrations();
    } else {
      console.log('∅ No migrations found, pushing schema directly...');
      this.pushSchema(connectionString);
      console.log('✓ Schema pushed successfully');
    }
  }

  private async runMigrations(): Promise<void> {
    console.log('📦 Applying migrations...');
    const pool = TestDatabase.createPool();
    const db = drizzle(pool);
    try {
      await migrate(db, {migrationsFolder});
      console.log('✓ Migrations applied successfully');
    } catch (error) {
      console.log('✖ Error during migration: ', error);
    }
    await pool.end();
  }

  private async migrationsExist(): Promise<boolean> {
    try {
      console.log(`Checking for migrations in folder: ${migrationsFolder}`);
      const files = await fs.readdir(migrationsFolder, {withFileTypes: true});
      return files.some(file => {
        const acceptedExt: boolean = file.name.endsWith('.sql') || file.name.endsWith('.ts');
        return file.isFile() && acceptedExt;
      });
    } catch {
      return false;
    }
  }

  /**
   * Push the Drizzle schema directly to the database using drizzle-kit API.
   * This uses the schema defined in src/db/schema.ts as the single source of truth.
   *
   * Drizzle Kit doesn't work well with ESM via ts-node, so we use tsx to execute its CJS entry point.
   * This avoids "require is not defined in ES module scope" errors.
   *
   * To ensure it works from any location, including when running or debugging from IntelliJ,
   * we need to specify the tsx path explicitly.
   *
   * This is ugly, if you find a better way to do it, please do it!
   *
   * Note: calling Drizzle programmatically can cause issues with schema type validation.
   */
  private pushSchema(connectionString: string): void {
    const cmd = `${tsx} ${drizzleKit} push --force --config ${configPath}`;
    execSync(cmd, {
      cwd: apiPath,
      env: {...process.env, DATABASE_URL: connectionString},
      stdio: 'pipe',
    });
  }

}
