import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {PayService} from '@bim/domain/payment';
import {PaymentBuildCache, PaymentExecutionService,} from '@bim/domain/payment';
import type {AccountRepository, NotificationGateway, SignatureProcessor, StarknetGateway} from '@bim/domain/ports';
import {Amount, BuildExpiredError, ExternalServiceError, ForbiddenError} from '@bim/domain/shared';
import {LightningInvoice, SwapId} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccount, createAccountRepoMock} from '../helper';

const logger = createLogger('silent');

const WBTC_TOKEN_ADDRESS = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
const STRK_TOKEN_ADDRESS = StarknetAddress.of('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const RECIPIENT_ADDRESS = StarknetAddress.of('0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321');
const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

const MOCK_ASSERTION = {
  authenticatorData: 'AAAA',
  clientDataJSON: 'BBBB',
  signature: 'CCCC',
};

describe('PaymentExecutionService', () => {
  let service: PaymentExecutionService;
  let paymentBuildCache: PaymentBuildCache;
  let mockPayService: PayService;
  let mockStarknetGateway: StarknetGateway;
  let mockSignatureProcessor: SignatureProcessor;
  let mockAccountRepo: AccountRepository;
  let mockNotificationGateway: NotificationGateway;

  beforeEach(() => {
    paymentBuildCache = new PaymentBuildCache();

    mockPayService = {
      savePaymentResult: vi.fn().mockResolvedValue(undefined),
    } as unknown as PayService;

    mockStarknetGateway = {
      executeSignedCalls: vi.fn().mockResolvedValue({txHash: '0xtxhash'}),
    } as unknown as StarknetGateway;

    mockSignatureProcessor = {
      process: vi.fn().mockReturnValue(['0xsig1', '0xsig2']),
    };

    mockAccountRepo = createAccountRepoMock();

    mockNotificationGateway = {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationGateway;

    service = new PaymentExecutionService({
      payService: mockPayService,
      starknetGateway: mockStarknetGateway,
      signatureProcessor: mockSignatureProcessor,
      paymentBuildCache,
      accountRepository: mockAccountRepo,
      notificationGateway: mockNotificationGateway,
      starknetConfig: {
        network: 'testnet',
        bitcoinNetwork: 'testnet',
        rpcUrl: 'http://localhost:5050',
        accountClassHash: '0x123',
        wbtcTokenAddress: WBTC_TOKEN_ADDRESS,
        strkTokenAddress: STRK_TOKEN_ADDRESS,
        feeTreasuryAddress: TREASURY_ADDRESS,
      },
      logger,
    });
  });

  function seedStarknetBuild(account = createAccount('deployed')): string {
    const buildId = 'test-build-id';
    paymentBuildCache.set(buildId, {
      preparedCalls: {
        network: 'starknet',
        calls: [{contractAddress: '0x1', entrypoint: 'transfer', calldata: ['0x2', '10000', '0']}],
        amount: Amount.ofSatoshi(10_000n),
        feeAmount: Amount.ofSatoshi(100n),
        recipientAddress: RECIPIENT_ADDRESS,
        tokenAddress: WBTC_TOKEN_ADDRESS,
      },
      typedData: {mock: true},
      senderAddress: account.requireStarknetAddress(),
      accountId: account.id,
      description: 'Test payment',
      createdAt: Date.now(),
    });
    return buildId;
  }

  it('throws BuildExpiredError when build not found', async () => {
    const account = createAccount('deployed');

    await expect(
      service.executePayment({buildId: 'nonexistent', assertion: MOCK_ASSERTION, account}),
    ).rejects.toThrow(BuildExpiredError);
  });

  it('throws ForbiddenError when account does not own the build', async () => {
    const owner = createAccount('deployed');
    seedStarknetBuild(owner);
    const intruder = createAccount('deployed', AccountId.of('660e8400-e29b-41d4-a716-446655440000'), StarknetAddress.of('0x0' + '2'.repeat(63)));

    await expect(
      service.executePayment({buildId: 'test-build-id', assertion: MOCK_ASSERTION, account: intruder}),
    ).rejects.toThrow(ForbiddenError);
  });

  it('executes a starknet payment and returns result', async () => {
    const account = createAccount('deployed');
    seedStarknetBuild(account);

    const result = await service.executePayment({
      buildId: 'test-build-id',
      assertion: MOCK_ASSERTION,
      account,
    });

    expect(result.network).toBe('starknet');
    expect(result.txHash).toBe('0xtxhash');
    expect(mockSignatureProcessor.process).toHaveBeenCalledWith(MOCK_ASSERTION, account.publicKey);
    expect(mockPayService.savePaymentResult).toHaveBeenCalledWith({
      txHash: '0xtxhash',
      accountId: account.id,
      description: 'Test payment',
    });
  });

  it('saves description for recipient when starknet transfer to a BIM user', async () => {
    const account = createAccount('deployed');
    const recipient = createAccount('deployed', undefined, RECIPIENT_ADDRESS);
    seedStarknetBuild(account);
    vi.mocked(mockAccountRepo.findByStarknetAddress).mockResolvedValue(recipient);

    await service.executePayment({
      buildId: 'test-build-id',
      assertion: MOCK_ASSERTION,
      account,
    });

    expect(mockPayService.savePaymentResult).toHaveBeenCalledTimes(2);
    expect(mockPayService.savePaymentResult).toHaveBeenCalledWith({
      txHash: '0xtxhash',
      accountId: recipient.id,
      description: 'Test payment',
    });
  });

  it('sends donation notification when isDonation is true', async () => {
    const account = createAccount('deployed');
    const buildId = 'donation-build';
    paymentBuildCache.set(buildId, {
      preparedCalls: {
        network: 'starknet',
        calls: [],
        amount: Amount.ofSatoshi(5_000n),
        feeAmount: Amount.zero(),
        recipientAddress: TREASURY_ADDRESS,
        tokenAddress: WBTC_TOKEN_ADDRESS,
      },
      typedData: {},
      senderAddress: account.requireStarknetAddress(),
      accountId: account.id,
      description: 'Donation',
      createdAt: Date.now(),
      isDonation: true,
    });

    await service.executePayment({buildId, assertion: MOCK_ASSERTION, account});

    expect(mockNotificationGateway.send).toHaveBeenCalled();
  });

  it('sends alert and rethrows on invalid-owner-sig error', async () => {
    const account = createAccount('deployed');
    seedStarknetBuild(account);
    vi.mocked(mockStarknetGateway.executeSignedCalls).mockRejectedValue(
      new ExternalServiceError('starknet', 'invalid-owner-sig: bad key'),
    );

    await expect(
      service.executePayment({buildId: 'test-build-id', assertion: MOCK_ASSERTION, account}),
    ).rejects.toThrow(ExternalServiceError);

    expect(mockNotificationGateway.send).toHaveBeenCalled();
  });

  it('returns lightning result with swap metadata', async () => {
    const account = createAccount('deployed');
    const buildId = 'ln-build';
    paymentBuildCache.set(buildId, {
      preparedCalls: {
        network: 'lightning',
        calls: [],
        amount: Amount.ofSatoshi(50_000n),
        feeAmount: Amount.ofSatoshi(500n),
        swapId: SwapId.of('swap-ln-1'),
        invoice: LightningInvoice.of(VALID_INVOICE),
        expiresAt: new Date('2030-01-01'),
      },
      typedData: {},
      senderAddress: account.requireStarknetAddress(),
      accountId: account.id,
      description: 'Lightning payment',
      createdAt: Date.now(),
    });

    const result = await service.executePayment({buildId, assertion: MOCK_ASSERTION, account});

    expect(result.network).toBe('lightning');
    if (result.network !== 'lightning') throw new Error('Expected lightning');
    expect(result.swapId).toBe(SwapId.of('swap-ln-1'));
    expect(result.invoice).toBe(LightningInvoice.of(VALID_INVOICE));
  });
});
