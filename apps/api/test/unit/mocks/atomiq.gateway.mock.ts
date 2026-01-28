import {StarknetAddress} from "@bim/domain/account";
import type {
  AtomiqGateway,
  AtomiqReverseSwapResult,
  AtomiqSwapResult,
  AtomiqSwapStatus,
  ClaimResult,
  UnsignedClaimTransactions
} from '@bim/domain/ports';
import {ExternalServiceError} from "@bim/domain/shared";
import {BitcoinAddress, LightningInvoice, SwapId, type SwapLimits} from '@bim/domain/swap';

/**
 * Mock implementation of AtomiqGateway for testing purposes.
 *
 * This implementation does not use the real Atomiq SDK. It generates
 * fake data and stores swaps in memory. Use this for:
 * - Unit tests
 * - Integration tests without external dependencies
 * - Development without Atomiq SDK setup
 */
export class AtomiqGatewayMock implements AtomiqGateway {
  private readonly swapRegistry = new Map<string, unknown>();

  // ===========================================================================
  // Swap Creation
  // ===========================================================================

  async createLightningToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<AtomiqSwapResult> {
    try {
      const swapId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // Mock: Generate a fake invoice
      const invoice = `lnbc${params.amountSats}n1...mock_invoice_${swapId}`;

      const swapObject = {
        id: swapId,
        type: 'lightning_to_starknet',
        amount: params.amountSats.toString(),
        destination: params.destinationAddress,
      };

      this.swapRegistry.set(swapId, swapObject);

      return {
        swapId,
        invoice,
        expiresAt,
        swapObject,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create Lightning swap: ${error}`,
      );
    }
  }

  async createBitcoinToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<AtomiqSwapResult> {
    try {
      const swapId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours

      // Mock: Generate a fake deposit address
      const depositAddress = `bc1q...mock_address_${swapId.slice(0, 8)}`;
      const bip21Uri = `bitcoin:${depositAddress}?amount=${Number(params.amountSats) / 100000000}`;

      const swapObject = {
        id: swapId,
        type: 'bitcoin_to_starknet',
        amount: params.amountSats.toString(),
        destination: params.destinationAddress,
      };

      this.swapRegistry.set(swapId, swapObject);

      return {
        swapId,
        depositAddress,
        bip21Uri,
        expiresAt,
        swapObject,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create Bitcoin swap: ${error}`,
      );
    }
  }

  async createStarknetToLightningSwap(params: {
    invoice: LightningInvoice;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult> {
    try {
      const swapId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // Mock: Parse amount from invoice (in production, decode the BOLT11)
      const amountSats = 100000n; // Placeholder

      // Mock: Generate deposit address (Starknet contract)
      const depositAddress = `0x${'0'.repeat(62)}${swapId.slice(0, 2)}`;

      const swapObject = {
        id: swapId,
        type: 'starknet_to_lightning',
        invoice: params.invoice,
        source: params.sourceAddress,
      };

      this.swapRegistry.set(swapId, swapObject);

      return {
        swapId,
        depositAddress,
        amountSats,
        expiresAt,
        swapObject,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create reverse Lightning swap: ${error}`,
      );
    }
  }

  async createStarknetToBitcoinSwap(params: {
    amountSats: bigint;
    destinationAddress: BitcoinAddress;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult> {
    try {
      const swapId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours

      // Mock: Generate deposit address (Starknet contract)
      const depositAddress = `0x${'0'.repeat(62)}${swapId.slice(0, 2)}`;

      const swapObject = {
        id: swapId,
        type: 'starknet_to_bitcoin',
        amount: params.amountSats.toString(),
        destination: params.destinationAddress,
        source: params.sourceAddress,
      };

      this.swapRegistry.set(swapId, swapObject);

      return {
        swapId,
        depositAddress,
        amountSats: params.amountSats,
        expiresAt,
        swapObject,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create reverse Bitcoin swap: ${error}`,
      );
    }
  }

  // ===========================================================================
  // Swap Limits
  // ===========================================================================

  async getLightningToStarknetLimits(): Promise<SwapLimits> {
    return {
      minSats: 10000n,        // 10k sats
      maxSats: 10000000n,     // 0.1 BTC
      feePercent: 0.5,
    };
  }

  async getBitcoinToStarknetLimits(): Promise<SwapLimits> {
    return {
      minSats: 50000n,        // 50k sats
      maxSats: 100000000n,    // 1 BTC
      feePercent: 0.3,
    };
  }

  async getStarknetToLightningLimits(): Promise<SwapLimits> {
    return {
      minSats: 10000n,        // 10k sats
      maxSats: 5000000n,      // 0.05 BTC
      feePercent: 0.5,
    };
  }

  async getStarknetToBitcoinLimits(): Promise<SwapLimits> {
    return {
      minSats: 50000n,        // 50k sats
      maxSats: 50000000n,     // 0.5 BTC
      feePercent: 0.3,
    };
  }

  // ===========================================================================
  // Swap Monitoring
  // ===========================================================================

  async registerSwapForMonitoring(
    swapId: SwapId,
    swapObject: unknown,
  ): Promise<void> {
    this.swapRegistry.set(swapId, swapObject);
  }

  async getSwapStatus(swapId: SwapId): Promise<AtomiqSwapStatus> {
    const swap = this.swapRegistry.get(swapId);

    if (!swap) {
      return {
        state: -1,
        isPaid: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true,
        error: 'Swap not found',
      };
    }

    // Mock: Return pending status
    return {
      state: 0,
      isPaid: false,
      isCompleted: false,
      isFailed: false,
      isExpired: false,
    };
  }

  async isSwapPaid(swapId: SwapId): Promise<boolean> {
    const status = await this.getSwapStatus(swapId);
    return status.isPaid;
  }

  // ===========================================================================
  // Swap Claiming
  // ===========================================================================

  async claimSwap(swapId: SwapId): Promise<ClaimResult> {
    const swap = this.swapRegistry.get(swapId);

    if (!swap) {
      throw new ExternalServiceError('Atomiq', `Swap not found: ${swapId}`);
    }

    // Mock: Return a fake transaction hash
    const txHash = `0x${crypto.randomUUID().replaceAll('-', '')}`;

    return {
      txHash,
      success: true,
    };
  }

  async waitForClaimConfirmation(swapId: SwapId): Promise<void> {
    // Mock: Wait for a short delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async getUnsignedClaimTransactions(
    swapId: SwapId,
  ): Promise<UnsignedClaimTransactions> {
    const swap = this.swapRegistry.get(swapId);

    if (!swap) {
      throw new ExternalServiceError('Atomiq', `Swap not found: ${swapId}`);
    }

    // Mock: Return empty transactions
    return {
      transactions: [],
      message: 'Mock claim transactions ready',
    };
  }

  // ===========================================================================
  // Test Helpers
  // ===========================================================================

  /**
   * Clears all registered swaps. Useful for test cleanup.
   */
  clearSwaps(): void {
    this.swapRegistry.clear();
  }

  /**
   * Sets a specific swap status for testing.
   */
  setSwapStatus(swapId: string, status: Partial<AtomiqSwapStatus>): void {
    const swap = this.swapRegistry.get(swapId);
    if (swap) {
      this.swapRegistry.set(swapId, { ...swap, _mockStatus: status });
    }
  }
}
