import type {StarknetAddress} from "@bim/domain/account";
import type {
  AtomiqGateway,
  AtomiqReverseSwapResult,
  AtomiqSwapResult,
  AtomiqSwapStatus,
  BitcoinSwapCommitResult,
  BitcoinSwapQuote,
} from '@bim/domain/ports';
import {ExternalServiceError} from "@bim/domain/shared";
import type {BitcoinAddress, LightningInvoice, SwapId} from '@bim/domain/swap';
import type {SwapDirection, SwapLimits} from '@bim/domain/swap';

/**
 * Mock implementation of AtomiqGateway for testing purposes.
 *
 * This implementation does not use the real Atomiq SDK. It generates
 * fake data and stores swap status in memory. Use this for:
 * - Unit tests
 * - Integration tests without external dependencies
 * - Development without Atomiq SDK setup
 */
export class AtomiqGatewayMock implements AtomiqGateway {
  private readonly mockStatuses = new Map<string, Partial<AtomiqSwapStatus>>();
  private readonly knownSwapIds = new Set<string>();
  private reverseSwapAmountSats: bigint | null = null;
  private bitcoinCommitCallsOverride: {contractAddress: string; entrypoint: string; calldata: string[]}[] | null = null;

  // ===========================================================================
  // Swap Creation
  // ===========================================================================

  async createLightningToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<AtomiqSwapResult> {
    const swapId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const hex = swapId.replaceAll('-', '');
    const invoice = `lnbc${params.amountSats}n1p${hex}${hex}`;

    this.knownSwapIds.add(swapId);

    return {swapId, invoice, expiresAt};
  }

  async createStarknetToLightningSwap(params: {
    invoice: LightningInvoice;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult> {
    const swapId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const amountSats = this.reverseSwapAmountSats ?? 100000n;

    this.knownSwapIds.add(swapId);

    return {
      swapId,
      commitCalls: [
        {contractAddress: '0x0123456789abcdef', entrypoint: 'approve', calldata: ['0x1', '0x2']},
        {contractAddress: '0x0123456789abcdef', entrypoint: 'initiate', calldata: ['0x3', '0x4']},
      ],
      amountSats,
      expiresAt,
    };
  }

  async createStarknetToBitcoinSwap(params: {
    amountSats: bigint;
    destinationAddress: BitcoinAddress;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult> {
    const swapId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

    this.knownSwapIds.add(swapId);

    return {
      swapId,
      commitCalls: [
        {contractAddress: '0x0123456789abcdef', entrypoint: 'approve', calldata: ['0x1', '0x2']},
        {contractAddress: '0x0123456789abcdef', entrypoint: 'initiate', calldata: ['0x3', '0x4']},
      ],
      amountSats: this.reverseSwapAmountSats ?? params.amountSats,
      expiresAt,
    };
  }

  // ===========================================================================
  // Bitcoin Two-Phase Flow
  // ===========================================================================

  async prepareBitcoinToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<BitcoinSwapQuote> {
    const swapId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

    this.knownSwapIds.add(swapId);

    return {
      swapId,
      commitCalls: this.bitcoinCommitCallsOverride ?? [
        {
          contractAddress: '0x0123456789abcdef',
          entrypoint: 'approve',
          calldata: ['0x1', '0x2', '0x0'],
        },
      ],
      expiresAt,
    };
  }

  async completeBitcoinSwapCommit(swapId: string): Promise<BitcoinSwapCommitResult> {
    if (!this.knownSwapIds.has(swapId)) {
      throw new ExternalServiceError('Atomiq', `Swap not found: ${swapId}`);
    }

    const hex = swapId.replaceAll('-', '');
    const depositAddress = `tb1q${hex}${hex}`.slice(0, 42);

    return {
      depositAddress,
      bip21Uri: `bitcoin:${depositAddress}?amount=0.001`,
    };
  }

  // ===========================================================================
  // Swap Limits
  // ===========================================================================

  async getLightningToStarknetLimits(): Promise<SwapLimits> {
    return {minSats: 10000n, maxSats: 10000000n, feePercent: 0.5};
  }

  async getBitcoinToStarknetLimits(): Promise<SwapLimits> {
    return {minSats: 50000n, maxSats: 100000000n, feePercent: 0.3};
  }

  async getStarknetToLightningLimits(): Promise<SwapLimits> {
    return {minSats: 10000n, maxSats: 5000000n, feePercent: 0.5};
  }

  async getStarknetToBitcoinLimits(): Promise<SwapLimits> {
    return {minSats: 50000n, maxSats: 50000000n, feePercent: 0.3};
  }

  // ===========================================================================
  // Swap Monitoring
  // ===========================================================================

  async getSwapStatus(swapId: SwapId, _direction?: SwapDirection): Promise<AtomiqSwapStatus> {
    const defaults: AtomiqSwapStatus = {
      state: 0,
      isPaid: false,
      isClaimable: false,
      isCompleted: false,
      isFailed: false,
      isExpired: false,
      isRefunded: false,
    };

    if (!this.knownSwapIds.has(swapId)) {
      return {
        ...defaults,
        state: -1,
        isExpired: true,
        error: 'Swap not found',
      };
    }

    const overrides = this.mockStatuses.get(swapId);
    if (overrides) {
      return {...defaults, ...overrides};
    }

    return defaults;
  }

  async isSwapPaid(swapId: SwapId): Promise<boolean> {
    const status = await this.getSwapStatus(swapId);
    return status.isPaid;
  }

  async claimForwardSwap(swapId: SwapId): Promise<{
    claimTxHash: string;
    refundTxHash: string | undefined;
    bountyAmount: bigint;
    userAddress: string;
  }> {
    if (!this.knownSwapIds.has(swapId)) {
      throw new Error(`Swap not found: ${swapId}`);
    }
    return {
      claimTxHash: `0xclaim_tx_${swapId}`,
      refundTxHash: `0xrefund_tx_${swapId}`,
      bountyAmount: 80_000_000_000_000_000_000n,
      userAddress: '0x0123456789abcdef',
    };
  }

  // ===========================================================================
  // Test Helpers
  // ===========================================================================

  clearSwaps(): void {
    this.knownSwapIds.clear();
    this.mockStatuses.clear();
    this.reverseSwapAmountSats = null;
    this.bitcoinCommitCallsOverride = null;
  }

  setReverseSwapAmountSats(amount: bigint): void {
    this.reverseSwapAmountSats = amount;
  }

  setBitcoinCommitCalls(calls: {contractAddress: string; entrypoint: string; calldata: string[]}[]): void {
    this.bitcoinCommitCallsOverride = calls;
  }

  setSwapStatus(swapId: string, status: Partial<AtomiqSwapStatus>): void {
    this.knownSwapIds.add(swapId);
    this.mockStatuses.set(swapId, status);
  }
}
