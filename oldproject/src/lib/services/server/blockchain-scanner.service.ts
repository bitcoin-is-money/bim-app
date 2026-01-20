/**
 * @fileoverview Blockchain Scanner Service
 *
 * This service monitors the Starknet blockchain for transactions involving
 * registered user addresses. It uses the getEvents RPC call to efficiently
 * scan for Transfer events and other relevant transactions.
 *
 * Key Features:
 * - Event-based transaction scanning using getEvents RPC
 * - Filters events by registered user addresses
 * - Processes Transfer events to track receipts and expenditures
 * - Stores minimal transaction data in the database
 * - Handles pagination for large event sets
 * - Updates last scanned block for each address
 *
 * @author bim
 * @version 1.0.0
 */

import { PublicEnv } from '$lib/config/env';
import { ServerPrivateEnv } from '$lib/config/server';
import { EVENT_SELECTORS, GAS_TOKENS, TOKEN_ADDRESSES } from '$lib/constants/blockchain.constants';
import { db, userAddresses, userTransactions, type NewUserTransaction } from '$lib/db';
import { logger } from '$lib/utils/logger';
import { eq, and } from 'drizzle-orm';
import { RpcProvider } from 'starknet';

/**
 * Transfer event structure from Starknet
 */
interface TransferEvent {
	transaction_hash: string;
	block_number: number;
	keys: string[];
	data: string[];
	from_address: string;
	block_timestamp?: number;
}

/**
 * Parsed transfer event data
 */
interface ParsedTransferEvent {
	transactionHash: string;
	blockNumber: number;
	tokenAddress: string;
	fromAddress: string;
	toAddress: string;
	amount: string;
	timestamp: Date;
}

/**
 * Blockchain Scanner Service for monitoring user transactions
 */
export class BlockchainScannerService {
	private static instance: BlockchainScannerService;
	private provider: RpcProvider;
	private isScanning: boolean = false;

	// ERC-20 Transfer event selector (keccak256 of "Transfer(from,to,value)")
	private readonly TRANSFER_EVENT_KEY = EVENT_SELECTORS.ERC20_TRANSFER;

	// WBTC contract address - prioritize this token over others
	private readonly WBTC_CONTRACT_ADDRESS = TOKEN_ADDRESSES.WBTC;

	// STRK token address - filter out these transactions (gas fees, not relevant for users)
	private readonly STRK_CONTRACT_ADDRESS = GAS_TOKENS.STRK;

	private constructor() {
		this.provider = new RpcProvider({
			nodeUrl: ServerPrivateEnv.STARKNET_RPC_URL(),
			specVersion: PublicEnv.STARKNET_SPEC_VERSION() as '0.9.0'
		});
	}

	static getInstance(): BlockchainScannerService {
		if (!BlockchainScannerService.instance) {
			BlockchainScannerService.instance = new BlockchainScannerService();
		}
		return BlockchainScannerService.instance;
	}

	/**
	 * Start scanning for transactions
	 */
	async startScanning(): Promise<void> {
		if (this.isScanning) {
			logger.info('Blockchain scanner is already running');
			return;
		}

		this.isScanning = true;
		logger.info('Starting blockchain scanner');

		try {
			await this.scanForNewTransactions();
		} catch (error) {
			logger.error('Error in blockchain scanner', error as Error);
		} finally {
			this.isScanning = false;
		}
	}

	/**
	 * Stop scanning
	 */
	stopScanning(): void {
		this.isScanning = false;
		logger.info('Stopping blockchain scanner');
	}

	/**
	 * Scan for new transactions for all registered addresses
	 */
	private async scanForNewTransactions(): Promise<void> {
		const database = db();
		if (!database) {
			logger.error('Database not available for blockchain scanning');
			return;
		}

		// Get all active user addresses
		const activeAddresses = await database
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.isActive, true));

		if (activeAddresses.length === 0) {
			logger.info('No active addresses to scan');
			return;
		}

		logger.info(`Scanning ${activeAddresses.length} addresses for new transactions`);

		// Get current block number
		const latestBlock = await this.provider.getBlockNumber();

		for (const address of activeAddresses) {
			try {
				await this.scanAddressTransactions(address, latestBlock);
			} catch (error) {
				logger.error(`Error scanning address ${address.starknetAddress}`, error as Error);
			}
		}
	}

	/**
	 * Scan transactions for a specific address
	 */
	private async scanAddressTransactions(
		address: typeof userAddresses.$inferSelect,
		latestBlock: number
	): Promise<void> {
		const database = db();
		if (!database) return;

		const fromBlock = Math.max(Number(address.lastScannedBlock), 0);
		const toBlock = latestBlock;

		if (fromBlock >= toBlock) {
			return; // No new blocks to scan
		}

		logger.info(
			`Scanning address ${address.starknetAddress} from block ${fromBlock} to ${toBlock}`
		);

		try {
			// Get Transfer events where this address is involved (either as sender or receiver)
			const events = await this.getTransferEvents(address.starknetAddress, fromBlock, toBlock);

			if (events.length > 0) {
				logger.info(
					`Found ${events.length} transfer events for address ${address.starknetAddress}`
				);

				// Parse and store events
				const parsedEvents = events.map((event) => this.parseTransferEvent(event));

				// Log details of found events
				parsedEvents.forEach((event, i) => {
					logger.debug(
						`Event ${i + 1}: TX ${event.transactionHash} - ${event.fromAddress} -> ${event.toAddress} (${event.amount})`
					);
				});

				await this.storeTransactions(address.id, parsedEvents);
			} else {
				logger.debug(
					`No transfer events found for address ${address.starknetAddress} in blocks ${fromBlock}-${toBlock}`
				);
			}

			// Update last scanned block
			await database
				.update(userAddresses)
				.set({ lastScannedBlock: toBlock })
				.where(eq(userAddresses.id, address.id));
		} catch (error) {
			logger.error(`Error scanning address ${address.starknetAddress}`, error as Error);
		}
	}

	/**
	 * Get Transfer events from the blockchain with pagination support
	 */
	private async getTransferEvents(
		address: string,
		fromBlock: number,
		toBlock: number
	): Promise<TransferEvent[]> {
		try {
			logger.debug(
				`Getting Transfer events for address ${address} from block ${fromBlock} to ${toBlock}`
			);

			// Get all Transfer events in the block range with pagination
			const allEvents = await this.getAllEventsWithPagination(fromBlock, toBlock);

			logger.debug(`Found ${allEvents.length} total Transfer events in range`);

			// Filter events to only include those involving our address
			const normalizedAddress = this.normalizeAddress(address);
			const filteredEvents = allEvents.filter((event) => {
				if (event.data.length >= 3) {
					// With noUncheckedIndexedAccess enabled, array indexing yields T | undefined.
					// We've verified length >= 3, so non-null assert is safe here.
					const from = event.data[0]!;
					const to = event.data[1]!;

					// Normalize addresses for comparison (remove padding)
					const normalizedFrom = this.normalizeAddress(from);
					const normalizedTo = this.normalizeAddress(to);

					const matches =
						normalizedFrom === normalizedAddress || normalizedTo === normalizedAddress;

					if (matches) {
						logger.debug(
							`Found matching event: TX ${event.transaction_hash}, from ${normalizedFrom}, to ${normalizedTo}`
						);
					}

					return matches;
				}
				return false;
			});

			// Remove duplicates based on transaction hash and event index
			const uniqueEvents = filteredEvents.filter(
				(event, index, self) =>
					index ===
					self.findIndex(
						(e) =>
							e.transaction_hash === event.transaction_hash &&
							e.from_address === event.from_address &&
							JSON.stringify(e.data) === JSON.stringify(event.data)
					)
			);

			logger.info(`Filtered to ${uniqueEvents.length} events involving address ${address}`);

			return uniqueEvents as TransferEvent[];
		} catch (error) {
			logger.error('Error getting transfer events from RPC', error as Error);
			throw error;
		}
	}

	/**
	 * Get all events with pagination support
	 */
	private async getAllEventsWithPagination(
		fromBlock: number,
		toBlock: number
	): Promise<TransferEvent[]> {
		let allEvents: TransferEvent[] = [];
		let continuationToken: string | undefined = undefined;
		let pageCount = 0;
		const maxPages = 50; // Safety limit to prevent infinite loops

		do {
			try {
				logger.debug(
					`Fetching events page ${pageCount + 1}${continuationToken ? ` with token ${continuationToken.substring(0, 16)}...` : ''}`
				);

				// Build filter without including undefined optional fields to satisfy
				// exactOptionalPropertyTypes
				const filter: any = {
					from_block: { block_number: fromBlock },
					to_block: { block_number: toBlock },
					keys: [[this.TRANSFER_EVENT_KEY]],
					chunk_size: 1000 // Increased chunk size for efficiency
				};
				if (continuationToken) {
					filter.continuation_token = continuationToken;
				}

				const response = await this.provider.getEvents(filter);

				logger.debug(`Page ${pageCount + 1}: Found ${response.events.length} events`);

				allEvents.push(...(response.events as TransferEvent[]));
				continuationToken = response.continuation_token;
				pageCount++;

				// Safety check to prevent infinite loops
				if (pageCount >= maxPages) {
					logger.warn(
						`Reached maximum page limit (${maxPages}) when fetching events. Some events may be missing.`
					);
					break;
				}
			} catch (error) {
				logger.error(`Error fetching events page ${pageCount + 1}`, error as Error);
				// If we have some events, return them; otherwise re-throw the error
				if (allEvents.length > 0) {
					logger.warn(`Returning ${allEvents.length} events collected before error`);
					break;
				} else {
					throw error;
				}
			}
		} while (continuationToken);

		logger.debug(`Collected ${allEvents.length} total events across ${pageCount} pages`);
		return allEvents;
	}

	/**
	 * Parse a transfer event into our transaction format
	 */
	private parseTransferEvent(event: TransferEvent): ParsedTransferEvent {
		// Guard against undefined due to noUncheckedIndexedAccess
		const fromAddress = event.data[0] ?? '';
		const toAddress = event.data[1] ?? '';
		const rawAmount = event.data[2] ?? '0x0';
		const tokenAddress = event.from_address;

		// Parse and validate amount - handle hex values properly
		let amount = '0';
		if (rawAmount) {
			try {
				// Handle hex format (0x prefix or plain hex)
				const hexAmount = rawAmount.startsWith('0x') ? rawAmount : `0x${rawAmount}`;
				const bigIntAmount = BigInt(hexAmount);

				// Store as string to preserve precision, but keep hex format
				amount = rawAmount;

				// Log zero amounts for debugging
				if (bigIntAmount === 0n) {
					logger.debug(`Zero amount detected in TX ${event.transaction_hash}: "${rawAmount}"`);
				} else {
					logger.debug(
						`Non-zero amount in TX ${event.transaction_hash}: "${rawAmount}" (${bigIntAmount.toString()})`
					);
				}
			} catch (error) {
				logger.warn(
					`Failed to parse amount "${rawAmount}" in TX ${event.transaction_hash}`,
					error as Error
				);
				amount = '0';
			}
		} else {
			logger.debug(`Empty/null amount in TX ${event.transaction_hash}`);
		}

		return {
			transactionHash: event.transaction_hash,
			blockNumber: event.block_number,
			tokenAddress: tokenAddress || '',
			fromAddress: fromAddress || '',
			toAddress: toAddress || '',
			amount,
			timestamp: event.block_timestamp ? new Date(event.block_timestamp * 1000) : new Date()
		};
	}

	/**
	 * Store transactions in the database
	 */
	private async storeTransactions(
		userAddressId: string,
		transactions: ParsedTransferEvent[]
	): Promise<void> {
		const database = db();
		if (!database) return;

		const newTransactions: NewUserTransaction[] = [];

		// Get the user's address for comparison
		const userAddress = await database
			.select()
			.from(userAddresses)
			.where(eq(userAddresses.id, userAddressId))
			.limit(1);

		const [userAddressRecord] = userAddress;
		if (!userAddressRecord) return;

		const normalizedUserAddress = this.normalizeAddress(userAddressRecord.starknetAddress);

		// Group transactions by hash to handle multiple events per transaction
		const transactionGroups = new Map<string, ParsedTransferEvent[]>();

		for (const tx of transactions) {
			const txHash = tx.transactionHash;
			if (!transactionGroups.has(txHash)) {
				transactionGroups.set(txHash, []);
			}
			transactionGroups.get(txHash)!.push(tx);
		}

		// Process each transaction group
		for (const [txHash, txEvents] of transactionGroups) {
			// Check if transaction already exists for THIS specific user address
			const existing = await database
				.select()
				.from(userTransactions)
				.where(
					and(
						eq(userTransactions.transactionHash, txHash),
						eq(userTransactions.userAddressId, userAddressId)
					)
				)
				.limit(1);

			if (existing.length > 0) {
				logger.debug(
					`Transaction ${txHash} already exists for user address ${userAddressRecord.starknetAddress}, skipping`
				);
				continue;
			}

			// Filter out STRK token events (gas fees, not relevant for user dashboard)
			const filteredEvents = txEvents.filter((event) => {
				const normalizedEventToken = this.normalizeAddress(event.tokenAddress);
				const normalizedStrkToken = this.normalizeAddress(this.STRK_CONTRACT_ADDRESS);
				const isStrkToken = normalizedEventToken === normalizedStrkToken;

				if (isStrkToken) {
					logger.debug(
						`Filtering out STRK token event: TX ${txHash}, Token ${event.tokenAddress}, Amount ${event.amount}`
					);
				}

				return !isStrkToken; // Exclude STRK events
			});

			// If all events were STRK (filtered out), skip this transaction entirely
			if (filteredEvents.length === 0) {
				logger.debug(`Transaction ${txHash} only contains STRK events, skipping entirely`);
				continue;
			}

			// If there are multiple events for the same transaction, prioritize WBTC token
			let selectedEvent = filteredEvents[0]; // Default to first filtered event

			if (filteredEvents.length > 1) {
				logger.debug(
					`Transaction ${txHash} has ${filteredEvents.length} non-STRK Transfer events, selecting best one`
				);

				// Log token addresses for debugging
				filteredEvents.forEach((event, index) => {
					logger.debug(`Event ${index + 1}: Token ${event.tokenAddress}, Amount ${event.amount}`);
				});

				// First priority: Find WBTC token events
				const wbtcEvents = filteredEvents.filter((event) => {
					// Normalize addresses for comparison (handle padding differences)
					const normalizedEventToken = this.normalizeAddress(event.tokenAddress);
					const normalizedWbtcToken = this.normalizeAddress(this.WBTC_CONTRACT_ADDRESS);
					return normalizedEventToken === normalizedWbtcToken;
				});

				logger.debug(
					`Found ${wbtcEvents.length} WBTC events out of ${filteredEvents.length} non-STRK events`
				);

				if (wbtcEvents.length > 0) {
					// If WBTC events found, select the one with highest non-zero amount
					const nonZeroWbtcEvents = wbtcEvents.filter((event) => {
						try {
							const hexAmount = event.amount.startsWith('0x') ? event.amount : `0x${event.amount}`;
							return BigInt(hexAmount) > 0n;
						} catch {
							return false;
						}
					});

					if (nonZeroWbtcEvents.length > 0) {
						// Select the WBTC event with the largest amount
						selectedEvent = nonZeroWbtcEvents.reduce((max, current) => {
							try {
								const maxAmount = BigInt(
									max.amount.startsWith('0x') ? max.amount : `0x${max.amount}`
								);
								const currentAmount = BigInt(
									current.amount.startsWith('0x') ? current.amount : `0x${current.amount}`
								);
								return currentAmount > maxAmount ? current : max;
							} catch {
								return max;
							}
						});

						logger.debug(
							`Selected WBTC event: ${selectedEvent.amount} from ${filteredEvents.length} events`
						);
					} else {
						// All WBTC events have zero amounts, use first WBTC event
						selectedEvent = wbtcEvents[0];
						logger.debug(
							`Selected WBTC event with zero amount: ${selectedEvent.amount} from ${filteredEvents.length} events`
						);
					}
				} else {
					// No WBTC events found, fallback to previous logic (highest non-zero amount)
					logger.debug(`No WBTC events found, falling back to amount-based selection`);

					const nonZeroEvents = filteredEvents.filter((event) => {
						try {
							const hexAmount = event.amount.startsWith('0x') ? event.amount : `0x${event.amount}`;
							return BigInt(hexAmount) > 0n;
						} catch {
							return false;
						}
					});

					if (nonZeroEvents.length > 0) {
						// Select the event with the largest amount
						selectedEvent = nonZeroEvents.reduce((max, current) => {
							try {
								const maxAmount = BigInt(
									max.amount.startsWith('0x') ? max.amount : `0x${max.amount}`
								);
								const currentAmount = BigInt(
									current.amount.startsWith('0x') ? current.amount : `0x${current.amount}`
								);
								return currentAmount > maxAmount ? current : max;
							} catch {
								return max;
							}
						});

						logger.debug(
							`Selected non-zero amount event (fallback): ${selectedEvent.amount} from ${filteredEvents.length} events`
						);
					} else {
						logger.debug(`All events have zero amounts, using first event`);
						selectedEvent = filteredEvents[0];
					}
				}
			}

			// Determine if this is a receipt or spent transaction
			if (!selectedEvent) {
				logger.warn(`No selectable event found for TX ${txHash}, skipping transaction`);
				continue;
			}
			const normalizedTo = this.normalizeAddress(selectedEvent.toAddress);
			const transactionType = normalizedTo === normalizedUserAddress ? 'receipt' : 'spent';

			newTransactions.push({
				userAddressId,
				transactionHash: selectedEvent.transactionHash,
				blockNumber: selectedEvent.blockNumber,
				transactionType,
				amount: selectedEvent.amount,
				tokenAddress: selectedEvent.tokenAddress,
				fromAddress: selectedEvent.fromAddress,
				toAddress: selectedEvent.toAddress,
				timestamp: selectedEvent.timestamp
			});
		}

		if (newTransactions.length > 0) {
			await database.insert(userTransactions).values(newTransactions);
			logger.info(
				`Stored ${newTransactions.length} new transactions for address ${userAddressRecord.starknetAddress}`
			);

			// Log details of stored transactions
			newTransactions.forEach((tx, i) => {
				logger.debug(
					`Stored TX ${i + 1}: ${tx.transactionHash} - Type: ${tx.transactionType}, Amount: ${tx.amount}`
				);
			});
		} else {
			logger.debug(`No new transactions to store (all were already processed)`);
		}
	}

	/**
	 * Normalize address for comparison (remove 0x prefix and leading zeros)
	 */
	private normalizeAddress(address: string): string {
		const clean = address.startsWith('0x') ? address.slice(2) : address;
		return clean.replace(/^0+/, '').toLowerCase() || '0';
	}

	/**
	 * Get scanning status
	 */
	getStatus(): { isScanning: boolean } {
		return { isScanning: this.isScanning };
	}
}

// Export lazy-initialized singleton getter to avoid initialization during build
export function getBlockchainScannerService(): BlockchainScannerService {
	return BlockchainScannerService.getInstance();
}
