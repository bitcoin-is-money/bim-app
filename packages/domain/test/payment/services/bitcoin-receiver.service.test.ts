import {AccountId, StarknetAddress} from '@bim/domain/account';
import {BitcoinReceiver, ReceiveBuildCache} from '@bim/domain/payment';
import type {
  NotificationGateway,
  SignatureProcessor,
  StarknetCall,
  StarknetGateway,
  SwapGateway,
  TransactionRepository,
} from '@bim/domain/ports';
import {
  Amount,
  BuildExpiredError,
  ExternalServiceError,
  ForbiddenError,
  InsufficientBalanceError,
} from '@bim/domain/shared';
import type {SwapCoordinator} from '@bim/domain/swap';
import {BitcoinAddress, Swap, SwapId} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccount} from '../../helper';

const logger = createLogger('silent');

const WBTC_TOKEN_ADDRESS = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
const STRK_TOKEN_ADDRESS = StarknetAddress.of('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const BTC_DEPOSIT_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const MOCK_ASSERTION = {
  authenticatorData: 'AAAA',
  clientDataJSON: 'BBBB',
  signature: 'CCCC',
};

function createStrkApproveCall(amount: bigint): StarknetCall {
  return {
    contractAddress: STRK_TOKEN_ADDRESS.toString(),
    entrypoint: 'approve',
    calldata: ['0xspender', amount.toString(), '0'],
  };
}

function createMockBitcoinReceiveSwap(): Swap {
  return Swap.createBitcoinToStarknet({
    id: SwapId.of('swap-btc-1'),
    amount: Amount.ofSatoshi(200_000n),
    destinationAddress: StarknetAddress.of('0x0' + '1'.repeat(63)),
    depositAddress: BTC_DEPOSIT_ADDRESS,
    expiresAt: new Date('2030-01-01'),
    description: 'Received',
    accountId: 'account-001',
  });
}

describe('BitcoinReceiver', () => {
  let service: BitcoinReceiver;
  let receiveBuildCache: ReceiveBuildCache;
  let mockStarknetGateway: StarknetGateway;
  let mockDexGateway: SwapGateway;
  let mockSignatureProcessor: SignatureProcessor;
  let mockSwapCoordinator: SwapCoordinator;
  let mockTransactionRepo: TransactionRepository;
  let mockNotificationGateway: NotificationGateway;

  beforeEach(() => {
    receiveBuildCache = new ReceiveBuildCache();

    mockStarknetGateway = {
      buildCalls: vi.fn().mockResolvedValue({typedData: {mock: true}, messageHash: '0xhash'}),
      getBalance: vi.fn().mockResolvedValue(0n),
      executeSignedCalls: vi.fn().mockResolvedValue({txHash: '0x' + 'ab'.repeat(32)}),
      waitForTransaction: vi.fn().mockResolvedValue(undefined),
    } as unknown as StarknetGateway;

    mockDexGateway = {
      getSwapCalls: vi.fn().mockResolvedValue({
        calls: [{contractAddress: '0xdex', entrypoint: 'swap', calldata: []}],
        sellAmount: 1000n,
        buyAmount: 50n * 10n ** 18n,
      }),
    } as unknown as SwapGateway;

    mockSignatureProcessor = {
      process: vi.fn().mockReturnValue(['0xsig']),
    };

    mockSwapCoordinator = {
      saveBitcoinCommit: vi.fn().mockResolvedValue(undefined),
      completeBitcoinToStarknet: vi.fn().mockResolvedValue({
        swap: createMockBitcoinReceiveSwap(),
        depositAddress: BTC_DEPOSIT_ADDRESS,
        bip21Uri: `bitcoin:${BTC_DEPOSIT_ADDRESS}?amount=0.002`,
      }),
    } as unknown as SwapCoordinator;

    mockTransactionRepo = {
      saveDescription: vi.fn().mockResolvedValue(undefined),
    } as unknown as TransactionRepository;

    mockNotificationGateway = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    service = new BitcoinReceiver({
      swapCoordinator: mockSwapCoordinator,
      starknetGateway: mockStarknetGateway,
      dexGateway: mockDexGateway,
      signatureProcessor: mockSignatureProcessor,
      receiveBuildCache,
      transactionRepository: mockTransactionRepo,
      notificationGateway: mockNotificationGateway,
      starknetConfig: {
        network: 'mainnet',
        bitcoinNetwork: 'mainnet',
        rpcUrl: 'http://localhost:5050',
        accountClassHash: '0x123',
        wbtcTokenAddress: WBTC_TOKEN_ADDRESS,
        strkTokenAddress: STRK_TOKEN_ADDRESS,
        feeTreasuryAddress: TREASURY_ADDRESS,
      },
      logger,
    });
  });

  describe('prepareCommit', () => {
    it('builds typed data and caches the result', async () => {
      const account = createAccount('deployed');
      const commitCalls: StarknetCall[] = [
        {contractAddress: '0xabc', entrypoint: 'commit', calldata: []},
      ];

      const result = await service.prepareCommit({
        swapId: 'swap-1',
        commitCalls,
        amount: Amount.ofSatoshi(200_000n),
        expiresAt: new Date('2030-01-01'),
        starknetAddress: account.requireStarknetAddress(),
        account,
        description: 'Test receive',
        useUriPrefix: true,
      });

      expect(result.buildId).toBeDefined();
      expect(result.messageHash).toBe('0xhash');

      const cached = receiveBuildCache.consume(result.buildId);
      expect(cached).toBeDefined();
      expect(cached?.swapId).toBe('swap-1');
      expect(cached?.accountId).toBe(account.id);
    });

    it('skips auto-swap when approve token is not STRK', async () => {
      const account = createAccount('deployed');
      const nonStrkApprove: StarknetCall = {
        contractAddress: WBTC_TOKEN_ADDRESS.toString(),
        entrypoint: 'approve',
        calldata: ['0xspender', '1000', '0'],
      };

      await service.prepareCommit({
        swapId: 'swap-1',
        commitCalls: [nonStrkApprove],
        amount: Amount.ofSatoshi(200_000n),
        expiresAt: new Date('2030-01-01'),
        starknetAddress: account.requireStarknetAddress(),
        account,
        description: undefined,
        useUriPrefix: true,
      });

      expect(mockDexGateway.getSwapCalls).not.toHaveBeenCalled();
    });

    it('skips auto-swap when STRK balance is sufficient', async () => {
      const account = createAccount('deployed');
      const approveAmount = 100n * 10n ** 18n;
      vi.mocked(mockStarknetGateway.getBalance).mockResolvedValue(approveAmount);

      await service.prepareCommit({
        swapId: 'swap-1',
        commitCalls: [createStrkApproveCall(approveAmount)],
        amount: Amount.ofSatoshi(200_000n),
        expiresAt: new Date('2030-01-01'),
        starknetAddress: account.requireStarknetAddress(),
        account,
        description: undefined,
        useUriPrefix: true,
      });

      expect(mockDexGateway.getSwapCalls).not.toHaveBeenCalled();
    });

    it('prepends DEX swap calls when STRK balance is insufficient', async () => {
      const account = createAccount('deployed');
      const approveAmount = 100n * 10n ** 18n;
      vi.mocked(mockStarknetGateway.getBalance)
        .mockResolvedValueOnce(0n)
        .mockResolvedValueOnce(10_000n);

      await service.prepareCommit({
        swapId: 'swap-1',
        commitCalls: [createStrkApproveCall(approveAmount)],
        amount: Amount.ofSatoshi(200_000n),
        expiresAt: new Date('2030-01-01'),
        starknetAddress: account.requireStarknetAddress(),
        account,
        description: undefined,
        useUriPrefix: true,
      });

      expect(mockDexGateway.getSwapCalls).toHaveBeenCalled();
      const buildCallsArg = vi.mocked(mockStarknetGateway.buildCalls).mock.calls[0]?.[0];
      expect(buildCallsArg?.calls.length).toBeGreaterThan(1);
    });

    it('throws InsufficientBalanceError when WBTC is insufficient for auto-swap', async () => {
      const account = createAccount('deployed');
      const approveAmount = 100n * 10n ** 18n;
      vi.mocked(mockStarknetGateway.getBalance)
        .mockResolvedValueOnce(0n)
        .mockResolvedValueOnce(0n);

      await expect(
        service.prepareCommit({
          swapId: 'swap-1',
          commitCalls: [createStrkApproveCall(approveAmount)],
          amount: Amount.ofSatoshi(200_000n),
          expiresAt: new Date('2030-01-01'),
          starknetAddress: account.requireStarknetAddress(),
          account,
          description: undefined,
          useUriPrefix: true,
        }),
      ).rejects.toThrow(InsufficientBalanceError);
    });
  });

  describe('commitAndComplete', () => {
    function seedBuild(account = createAccount('deployed')): string {
      const buildId = 'test-build';
      receiveBuildCache.set(buildId, {
        swapId: 'swap-btc-1',
        typedData: {mock: true},
        senderAddress: account.requireStarknetAddress(),
        accountId: account.id,
        amount: Amount.ofSatoshi(200_000n),
        expiresAt: new Date('2030-01-01'),
        description: 'Received',
        useUriPrefix: true,
        createdAt: Date.now(),
      });
      return buildId;
    }

    it('throws BuildExpiredError when build not found', async () => {
      const account = createAccount('deployed');

      await expect(
        service.commitAndComplete({buildId: 'nonexistent', assertion: MOCK_ASSERTION, account}),
      ).rejects.toThrow(BuildExpiredError);
    });

    it('throws ForbiddenError when account does not own the build', async () => {
      const owner = createAccount('deployed');
      seedBuild(owner);
      const intruder = createAccount('deployed', AccountId.of('660e8400-e29b-41d4-a716-446655440000'), StarknetAddress.of('0x0' + '2'.repeat(63)));

      await expect(
        service.commitAndComplete({buildId: 'test-build', assertion: MOCK_ASSERTION, account: intruder}),
      ).rejects.toThrow(ForbiddenError);
    });

    it('executes commit, saves swap, and returns deposit address', async () => {
      const account = createAccount('deployed');
      seedBuild(account);

      const result = await service.commitAndComplete({
        buildId: 'test-build',
        assertion: MOCK_ASSERTION,
        account,
      });

      expect(mockStarknetGateway.executeSignedCalls).toHaveBeenCalled();
      expect(mockStarknetGateway.waitForTransaction).toHaveBeenCalledWith('0x' + 'ab'.repeat(32));
      expect(mockSwapCoordinator.saveBitcoinCommit).toHaveBeenCalledWith(
        expect.objectContaining({swapId: 'swap-btc-1', commitTxHash: '0x' + 'ab'.repeat(32)}),
      );
      expect(mockSwapCoordinator.completeBitcoinToStarknet).toHaveBeenCalledWith({swapId: 'swap-btc-1'});
      expect(mockTransactionRepo.saveDescription).toHaveBeenCalled();
      expect(result.depositAddress).toBe(BitcoinAddress.of(BTC_DEPOSIT_ADDRESS));
      expect(result.bip21Uri).toBe(`bitcoin:${BTC_DEPOSIT_ADDRESS}?amount=0.002`);
    });

    it('omits the bitcoin: prefix when build.useUriPrefix is false', async () => {
      const account = createAccount('deployed');
      receiveBuildCache.set('test-build', {
        swapId: 'swap-btc-1',
        typedData: {mock: true},
        senderAddress: account.requireStarknetAddress(),
        accountId: account.id,
        amount: Amount.ofSatoshi(200_000n),
        expiresAt: new Date('2030-01-01'),
        description: 'Received',
        useUriPrefix: false,
        createdAt: Date.now(),
      });

      const result = await service.commitAndComplete({
        buildId: 'test-build',
        assertion: MOCK_ASSERTION,
        account,
      });

      expect(result.bip21Uri).toBe(`${BTC_DEPOSIT_ADDRESS}?amount=0.002`);
    });

    it('propagates errors from swapService.completeBitcoinToStarknet', async () => {
      const account = createAccount('deployed');
      seedBuild(account);
      vi.mocked(mockSwapCoordinator.completeBitcoinToStarknet).mockRejectedValue(
        new Error('atomiq unavailable'),
      );

      await expect(
        service.commitAndComplete({buildId: 'test-build', assertion: MOCK_ASSERTION, account}),
      ).rejects.toThrow('atomiq unavailable');
    });

    it('sends alert on invalid-owner-sig error', async () => {
      const account = createAccount('deployed');
      seedBuild(account);
      vi.mocked(mockStarknetGateway.executeSignedCalls).mockRejectedValue(
        new ExternalServiceError('starknet', 'invalid-owner-sig: bad key'),
      );

      await expect(
        service.commitAndComplete({buildId: 'test-build', assertion: MOCK_ASSERTION, account}),
      ).rejects.toThrow(ExternalServiceError);

      expect(mockNotificationGateway.send).toHaveBeenCalled();
    });

    it('continues even if security deposit description save fails', async () => {
      const account = createAccount('deployed');
      seedBuild(account);
      vi.mocked(mockTransactionRepo.saveDescription).mockRejectedValue(new Error('DB error'));

      const result = await service.commitAndComplete({
        buildId: 'test-build',
        assertion: MOCK_ASSERTION,
        account,
      });

      expect(result.depositAddress).toBeDefined();
    });
  });
});
