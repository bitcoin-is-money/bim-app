import { json } from '@sveltejs/kit';
import postgres from 'postgres';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Hard-disable in production builds
		if (!dev && process.env.NODE_ENV === 'production') {
			return json({ error: 'Not Found' }, { status: 404 });
		}

		const { DATABASE_URL } = process.env;

		if (!DATABASE_URL) {
			return json({ error: 'DATABASE_URL not configured' }, { status: 500 });
		}

		const client = postgres(DATABASE_URL, { max: 1 });

		try {
			// Check if tables exist
			const tablesQuery = `
        SELECT table_name, table_schema
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;

			const tables = await client.unsafe(tablesQuery);

			// Get columns for each table
			const schemaInfo: any = {};

			for (const table of tables as any[]) {
				const columnsQuery = `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = '${table.table_name}' 
          AND table_schema = 'public'
          ORDER BY ordinal_position;
        `;

				const columns = await client.unsafe(columnsQuery);
				schemaInfo[table.table_name] = {
					columns: columns,
					exists: true
				};
			}

			// Check for users table specifically
			const usersExistsQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `;

			const usersExists = await client.unsafe(usersExistsQuery);

			await client.end();

			return json({
				success: true,
				database_connected: true,
				tables: schemaInfo,
				users_table_exists: usersExists[0]?.exists || false,
				tables_count: tables.length,
				timestamp: new Date().toISOString()
			});
		} catch (dbError) {
			await client.end();
			throw dbError;
		}
	} catch (error) {
		console.error('Database schema debug error:', error);
		return json(
			{
				error: 'Database schema check failed',
				details: error instanceof Error ? error.message : 'Unknown error',
				database_connected: false
			},
			{ status: 500 }
		);
	}
};
