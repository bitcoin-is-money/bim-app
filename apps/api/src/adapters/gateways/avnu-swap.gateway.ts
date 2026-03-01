import type {SwapGateway, StarknetCall} from '@bim/domain/ports';
import {ExternalServiceError} from '@bim/domain/shared';
import type {Logger} from 'pino';

/**
 * Configuration for AVNU Swap gateway.
 */
export interface AvnuSwapConfig {
  baseUrl: string;
}

/**
 * AVNU quote response (subset of fields we need).
 */
interface AvnuQuote {
  quoteId: string;
  sellAmount: string;
  buyAmount: string;
}

/**
 * AVNU build response.
 */
interface AvnuBuildResponse {
  chainId: string;
  calls: {
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }[];
}

const SWAP_API_VERSION = 'v3';

/**
 * AVNU DEX aggregator gateway for token swaps.
 *
 * Uses the AVNU REST API directly (GET /swap/v3/quotes + POST /swap/v3/build)
 * instead of the official `@avnu/avnu-sdk` package. Reasons:
 *
 * 1. **Peer dependency conflict**: The published SDK v4.0.1 declares
 *    `peerDependencies: { starknet: "^8.9.1" }` which is incompatible with
 *    our starknet 9.x. The GitHub source has been updated to accept `^9.0.0`
 *    but this hasn't been published yet. When a compatible version is released,
 *    we can migrate to the SDK.
 *
 * 2. **Minimal surface**: We only need two endpoints (quotes + build), making
 *    the SDK's transitive dependencies (ethers, moment, dayjs) hard to justify.
 *
 * **REST API compatibility**: The endpoint parameters and response shapes are
 * derived from the SDK source code (`QuoteRequest`, `QuoteToCallsParams`,
 * `AvnuCalls` types in `@avnu/avnu-sdk`). The SDK is a thin wrapper around
 * these REST endpoints. However, this has NOT been validated against the live
 * API yet — the first real test will be on testnet.
 *
 * Base URLs:
 * - Mainnet: https://starknet.api.avnu.fi
 * - Testnet: https://sepolia.api.avnu.fi
 */
export class AvnuSwapGateway implements SwapGateway {
  private readonly log: Logger;

  constructor(
    private readonly config: AvnuSwapConfig,
    rootLogger: Logger,
  ) {
    this.log = rootLogger.child({name: 'avnu-swap.gateway.ts'});
  }

  async getSwapCalls(params: {
    sellToken: string;
    buyToken: string;
    buyAmount: bigint;
    takerAddress: string;
  }): Promise<{calls: StarknetCall[]; sellAmount: bigint; buyAmount: bigint}> {
    this.log.info(
      {
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        buyAmount: params.buyAmount.toString(),
        takerAddress: params.takerAddress,
      },
      'Getting swap quote from AVNU',
    );

    // 1. Get quote (exact output via buyAmount)
    const quote = await this.fetchQuote(params);

    this.log.info(
      {
        quoteId: quote.quoteId,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
      },
      'AVNU quote received',
    );

    // 2. Build swap calls from the quote
    const buildResponse = await this.buildSwap(quote.quoteId, params.takerAddress);

    const calls: StarknetCall[] = buildResponse.calls.map(call => ({
      contractAddress: call.contractAddress,
      entrypoint: call.entrypoint,
      calldata: call.calldata,
    }));

    this.log.info({callCount: calls.length}, 'AVNU swap calls built');

    return {
      calls,
      sellAmount: BigInt(quote.sellAmount),
      buyAmount: BigInt(quote.buyAmount),
    };
  }

  private async fetchQuote(params: {
    sellToken: string;
    buyToken: string;
    buyAmount: bigint;
    takerAddress: string;
  }): Promise<AvnuQuote> {
    const queryParams = new URLSearchParams({
      sellTokenAddress: params.sellToken,
      buyTokenAddress: params.buyToken,
      buyAmount: `0x${params.buyAmount.toString(16)}`,
      takerAddress: params.takerAddress,
      size: '1',
    });

    const url = `${this.config.baseUrl}/swap/${SWAP_API_VERSION}/quotes?${queryParams}`;

    const response = await fetch(url, {
      headers: {Accept: 'application/json'},
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ExternalServiceError(
        'AVNU Swap',
        `Quote request failed (HTTP ${response.status}): ${body}`,
      );
    }

    const quotes = (await response.json()) as AvnuQuote[];

    const quote = quotes.at(0);
    if (!quote) {
      throw new ExternalServiceError(
        'AVNU Swap',
        'No swap quotes available for the requested pair/amount',
      );
    }

    return quote;
  }

  private async buildSwap(quoteId: string, takerAddress: string): Promise<AvnuBuildResponse> {
    const url = `${this.config.baseUrl}/swap/${SWAP_API_VERSION}/build`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        quoteId,
        takerAddress,
        slippage: 0.05,
        includeApprove: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ExternalServiceError(
        'AVNU Swap',
        `Build swap failed (HTTP ${response.status}): ${body}`,
      );
    }

    return (await response.json()) as AvnuBuildResponse;
  }
}
