import type { RequestHandler } from '@sveltejs/kit';
import { ServerPrivateEnv } from '$lib/config/server';
import { EVENT_SELECTORS, TOKEN_ADDRESSES } from '$lib/constants/blockchain.constants';
import { WebSocketChannel } from 'starknet';

/**
 * SSE endpoint that proxies a Starknet WebSocket subscription (server-side)
 * and streams WBTC Transfer events to a specific recipient address.
 *
 * Query params:
 *  - address: Starknet address to monitor as recipient (0x-prefixed)
 */
export const GET: RequestHandler = async ({ url }) => {
	const address = url.searchParams.get('address')?.trim();
	if (!address || !address.startsWith('0x')) {
		return new Response('Missing or invalid address', { status: 400 });
	}

	// Normalize helper (remove 0x and leading zeros, lowercase)
	const normalize = (addr: string) =>
		(addr.startsWith('0x') ? addr.slice(2) : addr).replace(/^0+/, '').toLowerCase() || '0';
	const normalizedTarget = normalize(address);

	// Prepare SSE stream
	let cleanupRef: null | (() => Promise<void>) = null;

	const stream = new ReadableStream<Uint8Array>({
		start: async (controller) => {
			const encoder = new TextEncoder();

			// Send initial event to establish stream
			controller.enqueue(encoder.encode(`event: open\n`));
			controller.enqueue(encoder.encode(`data: {"status":"ok"}\n\n`));

			// Keepalive ping every 25s to keep proxies from closing the connection
			const keepAlive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(`event: ping\n`));
					controller.enqueue(encoder.encode(`data: {}\n\n`));
				} catch (_) {
					// Stream might be closed
				}
			}, 25000);

			// Create WebSocket channel to Starknet node
			const nodeUrl = ServerPrivateEnv.STARKNET_RPC_WSS();
			const channel = new WebSocketChannel({ nodeUrl });

			let sub: any | null = null;

			const cleanup = async () => {
				clearInterval(keepAlive);
				try {
					if (sub) await sub.unsubscribe();
				} catch (_) {}
				try {
					channel.disconnect();
				} catch (_) {}
			};
			cleanupRef = cleanup;

			// Subscribe to WBTC Transfer events
			try {
				await channel.waitForConnection();
				sub = await channel.subscribeEvents({
					fromAddress: TOKEN_ADDRESSES.WBTC,
					// Filter by event selector (ERC-20 Transfer)
					keys: [[EVENT_SELECTORS.ERC20_TRANSFER]]
					// Note: We intentionally omit finalityStatus to receive the provider default (typically L2-accepted / pre-confirmed)
				});

				// Handle incoming events
				sub.on((result: any) => {
					try {
						// result should be an EmittedEvent-like object
						const data: string[] | undefined = result?.data;
						const from_address: string | undefined = result?.from_address;
						const txHash: string | undefined = result?.transaction_hash;
						const blockNumber: number | undefined = result?.block_number;
						const finality: string | undefined = result?.finality_status || result?.status;

						// Guard & validate it is a Transfer from the WBTC contract
						if (!data || data.length < 3) return;
						if (!from_address) return;

						// Transfer(from, to, value) encoded in data
						const from = data[0] ?? '';
						const to = data[1] ?? '';
						const normalizedTo = normalize(to);

						if (normalizedTo !== normalizedTarget) return; // Not destined to our target address

						// Amount in sats (WBTC uses 8 decimals; treat raw value as sats unit)
						const rawAmount = data[2] ?? '0x0';
						let amountSats = '0';
						try {
							const hexLike = /^0x/i.test(rawAmount) ? rawAmount : `0x${rawAmount}`;
							amountSats = BigInt(hexLike).toString(10);
						} catch (_) {
							// If not hex, try decimal digits
							if (/^\d+$/.test(rawAmount)) amountSats = rawAmount;
						}

						const payload = {
							type: 'wbtc_transfer',
							to,
							txHash,
							blockNumber,
							finality: finality || 'UNKNOWN',
							amountSats
						};

						controller.enqueue(encoder.encode(`event: wbtc\n`));
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
					} catch (_) {
						// swallow handler errors to keep stream alive
					}
				});
			} catch (err) {
				// Stream a one-off error and close
				const msg = err instanceof Error ? err.message : 'Subscription error';
				controller.enqueue(encoder.encode(`event: error\n`));
				controller.enqueue(encoder.encode(`data: {"message": ${JSON.stringify(msg)}}\n\n`));
				await cleanup();
				controller.close();
				return;
			}

			// On stream cancel/close, clean resources
			// The controller.cancel() path triggers this cancel method automatically
			// but we also defensively cleanup when close() is called.
		},
		cancel: async () => {
			if (cleanupRef) await cleanupRef();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
};
