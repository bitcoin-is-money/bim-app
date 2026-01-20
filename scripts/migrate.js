import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { validateEnvironment } from './validate-env.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!validateEnvironment()) {
	console.error('🚨 Migration aborted due to environment validation failure');
	console.error('🔄 Railway will restart the process automatically');
	process.exit(1);
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(maxRetries = 5, baseDelay = 1000) {
	let lastError;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`🔗 Attempting database connection (${attempt}/${maxRetries})...`);

			const client = postgres(DATABASE_URL, {
				max: 1,
				connect_timeout: 30,
				idle_timeout: 30,
				ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
			});

			await client`SELECT 1`;
			console.log('✅ Database connection established');
			return client;
		} catch (error) {
			lastError = error;
			console.warn(`⚠️  Connection attempt ${attempt} failed:`, error.message);

			if (attempt < maxRetries) {
				const delay = baseDelay * Math.pow(2, attempt - 1);
				console.log(`⏳ Retrying in ${delay}ms...`);
				await sleep(delay);
			}
		}
	}

	throw lastError;
}

async function runMigrations() {
	console.log('🔄 Running database migrations...');
	let client;

	try {
		client = await connectWithRetry();
		const db = drizzle(client);

		console.log('📦 Applying migrations...');
		await migrate(db, { migrationsFolder: 'drizzle' });

		console.log('✅ Database migrations completed successfully');
		console.log('🚀 Ready to start application server...');
	} catch (error) {
		console.error('❌ Database migration failed:', error);
		console.error('💡 Troubleshooting tips:');
		console.error('  - Verify DATABASE_URL is correct');
		console.error('  - Ensure database service is running');
		console.error('  - Check network connectivity');
		console.error('🔄 Railway will restart automatically (SIGTERM expected)');
		process.exit(1);
	} finally {
		if (client) {
			try {
				await client.end();
				console.log('🔌 Database connection closed');
			} catch (error) {
				console.warn('⚠️  Error closing database connection:', error.message);
			}
		}
	}
}

runMigrations();
