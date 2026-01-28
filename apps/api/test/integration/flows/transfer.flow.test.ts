import {StarknetAddress} from '@bim/domain/account';
import {FeeConfig} from '@bim/domain/payment';
import {Erc20CallFactory} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {UuidCodec} from '@bim/lib/encoding';
import {type CredentialCreationOptions, WebauthnVirtualAuthenticator} from "@bim/test-toolkit/auth";
import type {Hono} from 'hono';
import pg from 'pg';
import {Account, Signer} from 'starknet';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {DevnetPaymasterGateway, StrkDevnetContext, TestApp, TestDatabase,} from '../helpers';
import {ETH_TOKEN_ADDRESS, STRK_TOKEN_ADDRESS} from '../helpers';

/**
 * API response type from /api/auth/register/begin
 */
interface BeginRegistrationResponse {
  options: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    timeout: number;
  };
  challengeId: string;
  accountId: string; // Pre-generated account ID - must be passed to completeRegistration
}

/**
 * API response type from registration complete
 */
interface RegistrationCompleteResponse {
  account: {
    id: string;
    username: string;
    starknetAddress: string | null;
    status: string;
  };
}

// The expected origin matches WEBAUTHN_ORIGIN env var set in test-app.ts
const webAuthnOrigin = 'http://localhost:8080';


/**
 * Converts API registration options to VirtualAuthenticator format.
 */
function toRegistrationOptions(apiResponse: BeginRegistrationResponse): CredentialCreationOptions {
  return {
    challenge: apiResponse.options.challenge,
    rp: {
      id: apiResponse.options.rpId,
      name: apiResponse.options.rpName,
    },
    user: {
      id: UuidCodec.toBase64Url(apiResponse.options.userId), // Convert UUID to base64url bytes
      name: apiResponse.options.userName,
      displayName: apiResponse.options.userName,
    },
    origin: webAuthnOrigin,
  };
}

/**
 * Transfer Flow Integration Tests
 *
 * Tests ETH and STRK transfers between a registered/deployed account
 * and a pre-deployed devnet account.
 *
 * Flow:
 * 1. Register a new account via WebAuthn flow
 * 2. Deploy the account to devnet
 * 3. Fund the deployed account with ETH and STRK
 * 4. Test transfers in both directions with a pre-deployed account
 *
 * Note: Devnet only has ETH and STRK predeployed, that's why we do not
 * have any test with WBTC transfers.
 */
describe('Transfer Flow', () => {
  let app: Hono;
  let pool: pg.Pool;
  let authenticator: WebauthnVirtualAuthenticator;
  let strkContext: StrkDevnetContext;
  let paymasterGateway: DevnetPaymasterGateway;

  // The registered and deployed account
  let deployedAccount: Account;
  let deployedAddress: string;

  // A pre-deployed devnet account for testing transfers
  let predeployedAccount: Account;
  let predeployedAddress: string;

  // BIM treasury account for fee collection tests
  // Uses the funding account (index 0) as the treasury
  let bimTreasuryAddress: string;

  /**
   * Helper to register and deploy a user account.
   * Must be called after the app and authenticator are initialized.
   */
  async function registerAndDeployUser(username: string): Promise<{
    sessionCookie: string;
    account: RegistrationCompleteResponse['account'];
    deployedAddress: string;
    deployedAccount: Account;
  }> {
    // Step 1: Register via WebAuthn
    const beginResponse = await TestApp
      .request(app)
      .post('/api/auth/register/begin', {username});
    const beginBody = await beginResponse.json() as BeginRegistrationResponse;
    const credential = await authenticator
      .createCredential(toRegistrationOptions(beginBody));

    const completeResponse = await TestApp
      .request(app)
      .post('/api/auth/register/complete', {
        challengeId: beginBody.challengeId,
        accountId: beginBody.accountId, // Pass accountId from begin to complete
        username,
        credential,
      });

    const completeBody = await completeResponse.json() as RegistrationCompleteResponse;
    const setCookie = completeResponse.headers.get('Set-Cookie') || '';
    const sessionMatch = /session=([^;]+)/.exec(setCookie);
    const sessionCookie = sessionMatch ? `session=${sessionMatch[1]}` : '';

    // Step 2: Deploy the account
    const deployResponse = await TestApp
      .request(app)
      .post('/api/account/deploy', {}, {
        headers: {Cookie: sessionCookie},
      });

    expect(deployResponse.status).toBe(200);
    const deployBody = await deployResponse.json() as {txHash: string; status: string};

    // Wait for deployment confirmation
    await strkContext.waitForTransaction(deployBody.txHash);

    // Get the actual deployed address (STARK-based, not P256-based)
    const actualDeployedAddress = paymasterGateway.getLastDeployedAddress();
    if (!actualDeployedAddress) {
      throw new Error('Failed to get deployed address');
    }

    // Create an Account instance for the deployed account using StarkSigner's private key
    const starkSigner = strkContext.getStarkSigner();
    if (!starkSigner) {
      throw new Error('StarkSigner not initialized');
    }

    const account = new Account({
      provider: strkContext.getDevnetProvider(),
      address: actualDeployedAddress,
      signer: new Signer(starkSigner.getPrivateKey()),
    });

    return {
      sessionCookie,
      account: completeBody.account,
      deployedAddress: actualDeployedAddress,
      deployedAccount: account,
    };
  }

  beforeAll(async () => {
    strkContext = StrkDevnetContext.create();
    // Initialize StarkSigner with devnet account 2's private key
    // (account 0 is for funding, account 1 is used by deployment.flow.test.ts)
    await strkContext.ensureStarkSignerInitialized(2);
    // Use P256Signer for WebAuthn credential creation
    authenticator = new WebauthnVirtualAuthenticator({signer: strkContext.getP256Signer()});
    // Get reference to paymaster gateway
    paymasterGateway = strkContext.getDevnetPaymasterGateway();
    pool = TestDatabase.createPool();
    app = TestApp.createTestApp({
      context: {
        gateways: {
          starknet: strkContext.getStarknetGateway(),
          paymaster: paymasterGateway,
        },
      },
    });

    // Get a pre-deployed devnet account for transfers
    // Use index 1 since we're using index 2 for StarkSigner (and index 0 is the funding account)
    predeployedAccount = await strkContext.createAccountFromPredeployed(1);
    predeployedAddress = predeployedAccount.address;

    // Use the funding account (index 0) as the BIM treasury for fee tests
    const fundingAccount = await strkContext.getFundingAccount();
    bimTreasuryAddress = fundingAccount.address;

    // Register and deploy a user account once for all transfer tests
    const result = await registerAndDeployUser('transfer_user');
    deployedAccount = result.deployedAccount;
    deployedAddress = result.deployedAddress;

    // Fund the deployed account with ETH (in addition to STRK from deployment)
    await strkContext.mintEth(deployedAddress, '10000000000000000000'); // 10 ETH
  });

  afterAll(async () => {
    strkContext.resetStarknetContext();
    await pool.end();
  });

  describe('ETH Transfers', () => {
    it('transfers ETH from deployed account to pre-deployed account', async () => {
      const amount = '1000000000000000'; // 0.001 ETH

      // Get initial balances
      const initialDeployedBalance = await strkContext.getEthBalance(deployedAddress);
      const initialPredeployedBalance = await strkContext.getEthBalance(predeployedAddress);

      // Deployed account should have been funded during setup
      expect(initialDeployedBalance).toBeGreaterThan(0n);

      // Execute transfer from deployed to pre-deployed
      const txHash = await strkContext.transferEth(deployedAccount, predeployedAddress, amount);

      // Verify the transaction hash format
      expect(txHash).toMatch(/^0x[0-9a-fA-F]+$/);

      // Verify balances changed
      const finalDeployedBalance = await strkContext.getEthBalance(deployedAddress);
      const finalPredeployedBalance = await strkContext.getEthBalance(predeployedAddress);

      // Sender balance decreased (by amount + gas fees)
      expect(finalDeployedBalance).toBeLessThan(initialDeployedBalance);

      // Receiver balance increased by the exact amount
      expect(finalPredeployedBalance).toBe(initialPredeployedBalance + BigInt(amount));
    });

    it('transfers ETH from pre-deployed account to deployed account', async () => {
      const amount = '500000000000000'; // 0.0005 ETH

      // Get initial balances
      const initialDeployedBalance = await strkContext.getEthBalance(deployedAddress);
      const initialPredeployedBalance = await strkContext.getEthBalance(predeployedAddress);

      // Execute transfer from pre-deployed to deployed
      const txHash = await strkContext.transferEth(predeployedAccount, deployedAddress, amount);

      // Verify the transaction hash format
      expect(txHash).toMatch(/^0x[0-9a-fA-F]+$/);

      // Verify balances changed
      const finalDeployedBalance = await strkContext.getEthBalance(deployedAddress);
      const finalPredeployedBalance = await strkContext.getEthBalance(predeployedAddress);

      // Receiver balance increased by the exact amount
      expect(finalDeployedBalance).toBe(initialDeployedBalance + BigInt(amount));

      // Sender balance decreased (by amount + gas fees)
      expect(finalPredeployedBalance).toBeLessThan(initialPredeployedBalance);
    });
  });

  describe('STRK Transfers', () => {
    it('transfers STRK from deployed account to pre-deployed account', async () => {
      const amount = '1000000000000000000'; // 1 STRK

      // Get initial balances
      const initialDeployedBalance = await strkContext.getStrkBalance(deployedAddress);
      const initialPredeployedBalance = await strkContext.getStrkBalance(predeployedAddress);

      // Deployed account should have been funded with STRK during deployment
      expect(initialDeployedBalance).toBeGreaterThan(0n);

      // Execute transfer from deployed to pre-deployed
      const txHash = await strkContext.transferStrk(deployedAccount, predeployedAddress, amount);

      // Verify the transaction hash format
      expect(txHash).toMatch(/^0x[0-9a-fA-F]+$/);

      // Verify balances changed
      const finalDeployedBalance = await strkContext.getStrkBalance(deployedAddress);
      const finalPredeployedBalance = await strkContext.getStrkBalance(predeployedAddress);

      // Sender balance decreased (by amount + gas fees paid in STRK)
      expect(finalDeployedBalance).toBeLessThan(initialDeployedBalance);

      // Receiver balance increased by the exact amount
      expect(finalPredeployedBalance).toBe(initialPredeployedBalance + BigInt(amount));
    });

    it('transfers STRK from pre-deployed account to deployed account', async () => {
      const amount = '500000000000000000'; // 0.5 STRK

      // Get initial balances
      const initialDeployedBalance = await strkContext.getStrkBalance(deployedAddress);
      const initialPredeployedBalance = await strkContext.getStrkBalance(predeployedAddress);

      // Execute transfer from pre-deployed to deployed
      const txHash = await strkContext.transferStrk(predeployedAccount, deployedAddress, amount);

      // Verify the transaction hash format
      expect(txHash).toMatch(/^0x[0-9a-fA-F]+$/);

      // Verify balances changed
      const finalDeployedBalance = await strkContext.getStrkBalance(deployedAddress);
      const finalPredeployedBalance = await strkContext.getStrkBalance(predeployedAddress);

      // Receiver balance increased by the exact amount
      expect(finalDeployedBalance).toBe(initialDeployedBalance + BigInt(amount));

      // Sender balance decreased (by amount + gas fees)
      expect(finalPredeployedBalance).toBeLessThan(initialPredeployedBalance);
    });
  });

  describe('Cross-token Operations', () => {
    it('can transfer both ETH and STRK in sequence', async () => {
      const ethAmount = '100000000000000'; // 0.0001 ETH
      const strkAmount = '100000000000000000'; // 0.1 STRK

      // Get initial balances for the pre-deployed account
      const initialEthBalance = await strkContext.getEthBalance(predeployedAddress);
      const initialStrkBalance = await strkContext.getStrkBalance(predeployedAddress);

      // Transfer ETH from deployed to pre-deployed
      await strkContext.transferEth(deployedAccount, predeployedAddress, ethAmount);

      // Transfer STRK from deployed to pre-deployed
      await strkContext.transferStrk(deployedAccount, predeployedAddress, strkAmount);

      // Verify both balances increased for the pre-deployed account
      const finalEthBalance = await strkContext.getEthBalance(predeployedAddress);
      const finalStrkBalance = await strkContext.getStrkBalance(predeployedAddress);

      expect(finalEthBalance).toBe(initialEthBalance + BigInt(ethAmount));
      expect(finalStrkBalance).toBe(initialStrkBalance + BigInt(strkAmount));
    });

    it('can receive both ETH and STRK from pre-deployed account', async () => {
      const ethAmount = '100000000000000'; // 0.0001 ETH
      const strkAmount = '100000000000000000'; // 0.1 STRK

      // Get initial balances for the deployed account
      const initialEthBalance = await strkContext.getEthBalance(deployedAddress);
      const initialStrkBalance = await strkContext.getStrkBalance(deployedAddress);

      // Transfer ETH from pre-deployed to deployed
      await strkContext.transferEth(predeployedAccount, deployedAddress, ethAmount);

      // Transfer STRK from pre-deployed to deployed
      await strkContext.transferStrk(predeployedAccount, deployedAddress, strkAmount);

      // Verify both balances increased for the deployed account
      const finalEthBalance = await strkContext.getEthBalance(deployedAddress);
      const finalStrkBalance = await strkContext.getStrkBalance(deployedAddress);

      expect(finalEthBalance).toBe(initialEthBalance + BigInt(ethAmount));
      expect(finalStrkBalance).toBe(initialStrkBalance + BigInt(strkAmount));
    });
  });

  describe('Transfers with BIM Fee', () => {
    /**
     * BIM fee tests verify that transfers can include a developer fee
     * that is sent to the BIM treasury as part of a multicall transaction.
     *
     * These tests use the domain Erc20CallFactory to create transfer calls,
     * demonstrating the proper separation between business logic (domain)
     * and infrastructure (StrkDevnetContext).
     *
     * Fee configuration: 0.1% (FeeConfig.DEFAULT_PERCENTAGE)
     */

    const createFactory = (treasuryAddress: string) =>
      new Erc20CallFactory({
        percentage: FeeConfig.DEFAULT_PERCENTAGE,
        recipientAddress: StarknetAddress.of(treasuryAddress),
      });

    it('transfers ETH with 0.1% fee to BIM treasury', async () => {
      const amountRaw = 1_000_000_000_000_000_000n; // 1 ETH
      const factory = createFactory(bimTreasuryAddress);

      // Use domain factory to create transfer calls
      const {calls, feeAmount} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: predeployedAddress,
        amount: Amount.ofSatoshi(amountRaw),
        applyFee: true,
      });

      // Verify fee calculation from domain service
      const feeRaw = feeAmount.getSat();
      expect(feeRaw).toBe(1_000_000_000_000_000n); // 0.001 ETH

      // Get initial balances
      const initialSenderBalance = await strkContext.getEthBalance(deployedAddress);
      const initialRecipientBalance = await strkContext.getEthBalance(predeployedAddress);
      const initialTreasuryBalance = await strkContext.getEthBalance(bimTreasuryAddress);

      // Execute multicall via infrastructure helper
      const txHash = await strkContext.executeMulticall(deployedAccount, calls);

      expect(txHash).toMatch(/^0x[0-9a-fA-F]+$/);

      // Verify balances
      const finalSenderBalance = await strkContext.getEthBalance(deployedAddress);
      const finalRecipientBalance = await strkContext.getEthBalance(predeployedAddress);
      const finalTreasuryBalance = await strkContext.getEthBalance(bimTreasuryAddress);

      // Sender balance decreased by amount + fee (gas is paid in STRK, not ETH)
      expect(finalSenderBalance).toBe(initialSenderBalance - amountRaw - feeRaw);

      // Recipient received the exact transfer amount
      expect(finalRecipientBalance).toBe(initialRecipientBalance + amountRaw);

      // Treasury received the exact fee amount
      expect(finalTreasuryBalance).toBe(initialTreasuryBalance + feeRaw);
    });

    it('transfers STRK with 0.1% fee to BIM treasury', async () => {
      const amountRaw = 10_000_000_000_000_000_000n; // 10 STRK
      const factory = createFactory(bimTreasuryAddress);

      // Use domain factory to create transfer calls
      const {calls, feeAmount} = factory.createTransfer({
        tokenAddress: STRK_TOKEN_ADDRESS,
        recipientAddress: predeployedAddress,
        amount: Amount.ofSatoshi(amountRaw),
        applyFee: true,
      });

      // Verify fee calculation from domain service
      const feeRaw = feeAmount.getSat();
      expect(feeRaw).toBe(10_000_000_000_000_000n); // 0.01 STRK

      // Get initial balances
      const initialSenderBalance = await strkContext.getStrkBalance(deployedAddress);
      const initialRecipientBalance = await strkContext.getStrkBalance(predeployedAddress);
      const initialTreasuryBalance = await strkContext.getStrkBalance(bimTreasuryAddress);

      // Execute multicall via infrastructure helper
      const txHash = await strkContext.executeMulticall(deployedAccount, calls);

      expect(txHash).toMatch(/^0x[0-9a-fA-F]+$/);

      // Verify balances
      const finalSenderBalance = await strkContext.getStrkBalance(deployedAddress);
      const finalRecipientBalance = await strkContext.getStrkBalance(predeployedAddress);
      const finalTreasuryBalance = await strkContext.getStrkBalance(bimTreasuryAddress);

      // Sender balance decreased by amount + fee + gas (gas is also in STRK)
      expect(finalSenderBalance).toBeLessThan(initialSenderBalance - amountRaw - feeRaw);

      // Recipient received the exact transfer amount
      expect(finalRecipientBalance).toBe(initialRecipientBalance + amountRaw);

      // Treasury received the exact fee amount
      expect(finalTreasuryBalance).toBe(initialTreasuryBalance + feeRaw);
    });

    it('handles small amounts where fee rounds to zero', async () => {
      // Amount small enough that 0.1% fee rounds down to 0
      const amountRaw = 999n; // < 1000 wei
      const factory = createFactory(bimTreasuryAddress);

      // Use domain factory - fee should be 0
      const {calls, feeAmount} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: predeployedAddress,
        amount: Amount.ofSatoshi(amountRaw),
        applyFee: true,
      });

      // Verify factory returns no fee call
      expect(feeAmount.isZero()).toBe(true);
      expect(calls).toHaveLength(1); // Only transfer, no fee

      // Get initial balances
      const initialRecipientBalance = await strkContext.getEthBalance(predeployedAddress);
      const initialTreasuryBalance = await strkContext.getEthBalance(bimTreasuryAddress);

      // Execute single call (no fee)
      await strkContext.executeMulticall(deployedAccount, calls);

      // Verify balances
      const finalRecipientBalance = await strkContext.getEthBalance(predeployedAddress);
      const finalTreasuryBalance = await strkContext.getEthBalance(bimTreasuryAddress);

      // Recipient received the amount
      expect(finalRecipientBalance).toBe(initialRecipientBalance + amountRaw);

      // Treasury balance unchanged (no fee)
      expect(finalTreasuryBalance).toBe(initialTreasuryBalance);
    });

    it('fee calculation is consistent across multiple transfers', async () => {
      const amountsRaw = [
        1_000_000_000_000_000n,     // 0.001 ETH
        5_000_000_000_000_000_000n, // 5 ETH
        100_000_000_000_000_000n,   // 0.1 ETH
      ];
      const factory = createFactory(bimTreasuryAddress);

      // Get initial treasury balance
      const initialTreasuryBalance = await strkContext.getEthBalance(bimTreasuryAddress);
      let expectedTotalFees = 0n;

      // Execute multiple transfers using domain factory
      for (const amountRaw of amountsRaw) {
        const {calls, feeAmount} = factory.createTransfer({
          tokenAddress: ETH_TOKEN_ADDRESS,
          recipientAddress: predeployedAddress,
          amount: Amount.ofSatoshi(amountRaw),
          applyFee: true,
        });
        expectedTotalFees += feeAmount.getSat();

        await strkContext.executeMulticall(deployedAccount, calls);
      }

      // Verify total fees collected
      const finalTreasuryBalance = await strkContext.getEthBalance(bimTreasuryAddress);
      expect(finalTreasuryBalance).toBe(initialTreasuryBalance + expectedTotalFees);
    });
  });
});
