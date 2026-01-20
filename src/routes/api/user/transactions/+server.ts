import { db, userAddresses, userTransactions } from '$lib/db';
import { authMiddleware } from '$lib/middleware/auth';
import { json } from '@sveltejs/kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		// Check if database is available
		const database = db();
		if (!database) {
			return json({ error: 'Database not configured' }, { status: 500 });
		}

		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		// Parse query parameters
		const limit = Math.min(parseInt(event.url.searchParams.get('limit') || '50'), 100);
		const offset = parseInt(event.url.searchParams.get('offset') || '0');
		const addressFilter = event.url.searchParams.get('address');
		const transactionTypeFilter = event.url.searchParams.get('type'); // 'receipt' or 'spent'

		// First, get user's addresses
		const userAddressesQuery = database
			.select({ id: userAddresses.id })
			.from(userAddresses)
			.where(eq(userAddresses.userId, authResult.user?.id));

		// Add address filter if specified
		if (addressFilter) {
			userAddressesQuery.where(
				and(
					eq(userAddresses.userId, authResult.user?.id),
					eq(userAddresses.starknetAddress, addressFilter)
				)
			);
		}

		const userAddressIds = await userAddressesQuery;

		if (userAddressIds.length === 0) {
			return json({
				success: true,
				transactions: [],
				pagination: {
					limit,
					offset,
					total: 0
				}
			});
		}

		// Build the main query
		let transactionsQuery = database
			.select({
				id: userTransactions.id,
				transactionHash: userTransactions.transactionHash,
				blockNumber: userTransactions.blockNumber,
				transactionType: userTransactions.transactionType,
				amount: userTransactions.amount,
				tokenAddress: userTransactions.tokenAddress,
				fromAddress: userTransactions.fromAddress,
				toAddress: userTransactions.toAddress,
				timestamp: userTransactions.timestamp,
				processedAt: userTransactions.processedAt,
				starknetAddress: userAddresses.starknetAddress,
				addressType: userAddresses.addressType
			})
			.from(userTransactions)
			.innerJoin(userAddresses, eq(userTransactions.userAddressId, userAddresses.id))
			.where(
				inArray(
					userTransactions.userAddressId,
					userAddressIds.map((addr) => addr.id)
				)
			);

		// Add transaction type filter if specified
		if (
			transactionTypeFilter &&
			(transactionTypeFilter === 'receipt' || transactionTypeFilter === 'spent')
		) {
			transactionsQuery = transactionsQuery.where(
				and(
					inArray(
						userTransactions.userAddressId,
						userAddressIds.map((addr) => addr.id)
					),
					eq(userTransactions.transactionType, transactionTypeFilter)
				)
			);
		}

		// Add pagination and ordering
		const transactions = await transactionsQuery
			.orderBy(desc(userTransactions.timestamp))
			.limit(limit)
			.offset(offset);

		// Get total count for pagination
		const totalCountResult = await database
			.select({ count: sql<number>`count(*)` })
			.from(userTransactions)
			.where(
				inArray(
					userTransactions.userAddressId,
					userAddressIds.map((addr) => addr.id)
				)
			);

		const total = totalCountResult[0]?.count || 0;

		return json({
			success: true,
			transactions,
			pagination: {
				limit,
				offset,
				total,
				hasNext: offset + limit < total,
				hasPrev: offset > 0
			}
		});
	} catch (error) {
		console.error('Transaction list error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
