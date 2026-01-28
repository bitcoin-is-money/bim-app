import {StarknetAddress} from '@bim/domain/account';
import {
  type BitcoinPaymentService,
  type LightningPaymentService,
  PaymentService,
  type StarknetPaymentService,
} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {Swap, SwapId, SwapNotFoundError, type SwapService} from '@bim/domain/swap';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const DESTINATION_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

function createMockSwap(): Swap {
  return Swap.createLightningToStarknet({
    id: SwapId.of('recv-ln-001'),
    amount: Amount.ofSatoshi(50_000n),
    destinationAddress: DESTINATION_ADDRESS,
    invoice: VALID_INVOICE,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
}

describe('PaymentService - getStatus', () => {
  let service: PaymentService;
  let mockSwapService: SwapService;

  beforeEach(() => {
    mockSwapService = {
      createLightningToStarknet: vi.fn(),
      createBitcoinToStarknet: vi.fn(),
      createStarknetToLightning: vi.fn(),
      createStarknetToBitcoin: vi.fn(),
      fetchStatus: vi.fn(),
      fetchLimits: vi.fn(),
      claim: vi.fn(),
    } as unknown as SwapService;

    service = new PaymentService({
      starknet: {} as unknown as StarknetPaymentService,
      lightning: {} as unknown as LightningPaymentService,
      bitcoin: {} as unknown as BitcoinPaymentService,
      swapService: mockSwapService,
    });
  });

  it('delegates to swapService.fetchStatus', async () => {
    const swapId = SwapId.of('swap-123');
    vi.mocked(mockSwapService.fetchStatus).mockResolvedValue({
      swap: createMockSwap(),
      status: 'pending',
      progress: 0,
    });

    await service.getStatus(swapId);

    expect(mockSwapService.fetchStatus).toHaveBeenCalledWith({swapId});
  });

  it('returns status, progress and txHash', async () => {
    const swapId = SwapId.of('swap-123');
    vi.mocked(mockSwapService.fetchStatus).mockResolvedValue({
      swap: createMockSwap(),
      status: 'confirming',
      progress: 66,
      txHash: '0xabcdef',
    });

    const result = await service.getStatus(swapId);

    expect(result.status).toBe('confirming');
    expect(result.progress).toBe(66);
    expect(result.txHash).toBe('0xabcdef');
  });

  it('returns undefined txHash when not available', async () => {
    const swapId = SwapId.of('swap-123');
    vi.mocked(mockSwapService.fetchStatus).mockResolvedValue({
      swap: createMockSwap(),
      status: 'pending',
      progress: 0,
    });

    const result = await service.getStatus(swapId);

    expect(result.status).toBe('pending');
    expect(result.progress).toBe(0);
    expect(result.txHash).toBeUndefined();
  });

  it('propagates SwapNotFoundError from swap service', async () => {
    const swapId = SwapId.of('nonexistent');
    vi.mocked(mockSwapService.fetchStatus).mockRejectedValue(
      new SwapNotFoundError(swapId),
    );

    expect(service.getStatus(swapId)).rejects.toThrow(SwapNotFoundError);
  });
});
