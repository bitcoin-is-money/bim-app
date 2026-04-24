import {StarknetAddress} from '@bim/domain/account';
import {DonationBuilder, PaymentBuildCache} from '@bim/domain/payment';
import type {StarknetGateway} from '@bim/domain/ports';
import {AccountNotDeployedError} from '@bim/domain/shared';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccount} from '../../helper';

const logger = createLogger('silent');

const WBTC_TOKEN_ADDRESS = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
const STRK_TOKEN_ADDRESS = StarknetAddress.of('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');

describe('DonationBuilder', () => {
  let service: DonationBuilder;
  let mockStarknetGateway: StarknetGateway;
  let paymentBuildCache: PaymentBuildCache;

  beforeEach(() => {
    mockStarknetGateway = {
      buildCalls: vi.fn().mockResolvedValue({typedData: {mock: true}, messageHash: '0xabc'}),
    } as unknown as StarknetGateway;

    paymentBuildCache = new PaymentBuildCache();

    service = new DonationBuilder({
      starknetGateway: mockStarknetGateway,
      paymentBuildCache,
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

  it('throws AccountNotDeployedError when account is not deployed', async () => {
    const account = createAccount('pending');

    await expect(
      service.build({amountSats: '10000', account}),
    ).rejects.toThrow(AccountNotDeployedError);
  });

  it('returns buildId, messageHash and credentialId', async () => {
    const account = createAccount('deployed');

    const result = await service.build({amountSats: '10000', account});

    expect(result.buildId).toBeDefined();
    expect(result.messageHash).toBe('0xabc');
    expect(result.credentialId).toBe(account.credentialId);
  });

  it('caches donation build with isDonation flag and zero fee', async () => {
    const account = createAccount('deployed');

    const result = await service.build({amountSats: '10000', account});

    const cached = paymentBuildCache.consume(result.buildId);
    expect(cached?.isDonation).toBe(true);
    expect(cached?.description).toBe('Donation');
    expect(cached?.preparedCalls.feeAmount.getSat()).toBe(0n);
  });

  it('builds ERC-20 transfer call to treasury', async () => {
    const account = createAccount('deployed');

    await service.build({amountSats: '10000', account});

    expect(mockStarknetGateway.buildCalls).toHaveBeenCalledWith({
      senderAddress: account.requireStarknetAddress(),
      calls: [{
        contractAddress: WBTC_TOKEN_ADDRESS.toString(),
        entrypoint: 'transfer',
        calldata: [TREASURY_ADDRESS.toString(), '10000', '0'],
      }],
    });
  });
});
