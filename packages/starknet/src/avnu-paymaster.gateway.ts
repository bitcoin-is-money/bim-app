import type {StarknetAddress} from "@bim/domain/account";
import type {HealthRegistry} from "@bim/domain/health";
import type {
  DeployTransaction,
  PaymasterGateway,
  PaymasterResult,
  PaymasterTransaction,
  StarknetCall,
  StarknetTransaction
} from "@bim/domain/ports";
import {ExternalServiceError, InsufficientBalanceError, PaymasterServiceError, SanitizedError} from "@bim/domain/shared";

import type {Logger} from "pino";
import type {WALLET_API} from '@starknet-io/starknet-types-010';
import {type ExecutableUserTransaction, type ExecutionParameters, PaymasterRpc, type UserTransaction} from 'starknet';

/** Minimum remaining STRK credits below which the paymaster is considered down. */
const MIN_STRK_CREDITS_WEI = 1_000_000_000_000_000_000n;

/**
 * Configuration for AVNU Paymaster gateway.
 */
export interface AvnuPaymasterConfig {
  apiUrl: string;
  apiKey: string;
  /**
   * Full URL of the AVNU sponsor-activity endpoint (remaining sponsor credits).
   * Different from `apiUrl` which points to the SNIP-29 JSON-RPC paymaster endpoint.
   * Examples:
   *   https://sepolia.api.avnu.fi/paymaster/v1/sponsor-activity
   *   https://starknet.api.avnu.fi/paymaster/v1/sponsor-activity
   */
  sponsorActivityUrl: string;
}

/**
 * Response shape from GET /paymaster/v1/sponsor-activity.
 * `remainingStrkCredits` is a hex-encoded uint (wei, 18 decimals).
 */
interface SponsorActivityResponse {
  remainingStrkCredits?: string;
}

/**
 * SNIP-29 JSON-RPC response shape from paymaster_executeTransaction.
 */
interface SNIP29ExecuteResponse {
  jsonrpc: string;
  id: number;
  result?: {
    transaction_hash: string;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * AVNU Paymaster gateway implementation for gasless transactions.
 *
 * Deploy path uses raw SNIP-29 JSON-RPC (paymaster_executeTransaction).
 * Invoke path uses starknet.js PaymasterRpc (buildTransaction + executeTransaction).
 */
export class AvnuPaymasterGateway implements PaymasterGateway {
  private readonly log: Logger;
  private readonly paymasterRpc: PaymasterRpc;

  constructor(
    private readonly config: AvnuPaymasterConfig,
    rootLogger: Logger,
    private readonly healthRegistry: HealthRegistry,
  ) {
    this.log = rootLogger.child({name: 'avnu-paymaster.gateway.ts'});

    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['x-paymaster-api-key'] = config.apiKey;
    }
    this.paymasterRpc = new PaymasterRpc({
      nodeUrl: config.apiUrl,
      headers,
    });
  }

  /**
   * Checks paymaster health by fetching remaining sponsor credits.
   *
   * Reports the component as down when:
   * - `getRemainingCredits()` fails (API unreachable, invalid key, etc.)
   * - Remaining credits are below `MIN_STRK_CREDITS_WEI` (1 STRK)
   *
   * The credit threshold is critical: AVNU error 163 ("InvalidAPIKey") is
   * raised at runtime when credits drop to zero, so the startup check catches
   * this misconfiguration before the first user transaction fails.
   */
  async checkHealth(): Promise<void> {
    try {
      const credits = await this.getRemainingCredits();
      if (credits < MIN_STRK_CREDITS_WEI) {
        const sanitized: SanitizedError = {
          kind: 'credits',
          summary: `AVNU paymaster credits exhausted: ${credits.toString()} wei remaining (threshold: ${MIN_STRK_CREDITS_WEI.toString()} wei)`,
        };
        this.log.error({avnuError: sanitized}, 'AVNU paymaster health check failed');
        this.healthRegistry.reportDown('avnu-paymaster', sanitized);
        return;
      }
      this.log.debug({credits: credits.toString()}, 'AVNU paymaster healthy');
      this.healthRegistry.reportHealthy('avnu-paymaster');
    } catch (err: unknown) {
      const sanitized = sanitizeAvnuError(err);
      this.log.error({avnuError: sanitized}, 'AVNU paymaster health check failed');
      this.healthRegistry.reportDown('avnu-paymaster', sanitized);
    }
  }

  async executeTransaction(params: {
    transaction: StarknetTransaction | DeployTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult> {
    this.log.debug({
        type: params.transaction.type,
        accountAddress: params.accountAddress.toString()
      },
      'Executing paymaster transaction');
    if (params.transaction.type === 'DEPLOY_ACCOUNT') {
      return this.executeDeployViaSNIP29(
        params.transaction as DeployTransaction,
        params.accountAddress,
      );
    }

    throw new ExternalServiceError(
      'AVNU Paymaster',
      'Direct invoke execution is not supported. Use buildInvokeTransaction + executeInvokeTransaction instead.',
    );
  }

  /**
   * Detects AVNU error 163 (invalid/exhausted API key) from an error message.
   * Both conditions must match: error code 163 AND "api-key" substring.
   */
  private isPaymasterApiKeyError(message: string): boolean {
    return message.includes('163') && message.toLowerCase().includes('api-key');
  }

  // ===========================================================================
  // SNIP-29 Invoke (build + execute with WebAuthn signature)
  // ===========================================================================

  /**
   * Builds an invoke transaction via SNIP-29 paymaster_buildTransaction.
   * Returns OutsideExecution typed data that must be signed by the user.
   */
  async buildInvokeTransaction(params: {
    calls: readonly StarknetCall[];
    accountAddress: StarknetAddress;
  }): Promise<{typedData: unknown}> {
    const accountAddress = params.accountAddress.toString();
    this.log.info(
      {accountAddress, callCount: params.calls.length},
      'Building invoke transaction via SNIP-29',
    );

    try {
      const payload: UserTransaction = {
        type: 'invoke' as const,
        invoke: {
          userAddress: accountAddress,
          calls: params.calls.map(c => ({
            contractAddress: c.contractAddress,
            entrypoint: c.entrypoint,
            calldata: [...c.calldata],
          })),
        },
      };

      const parameters: ExecutionParameters = {
        feeMode: {mode: 'sponsored' as const},
        version: '0x1' as const,
      };

      const response = await this.paymasterRpc.buildTransaction(payload, parameters);

      if (response.type !== 'invoke') {
        throw new ExternalServiceError(
          'AVNU Paymaster',
          `Expected invoke response but got ${response.type}`,
        );
      }

      this.log.info(
        {accountAddress, responseType: response.type},
        'SNIP-29 buildTransaction succeeded',
      );

      return {typedData: response.typed_data};
    } catch (err: unknown) {
      if (err instanceof ExternalServiceError || err instanceof PaymasterServiceError) {
        throw err;
      }
      const message = err instanceof Error
        ? err.message
        : String(err);
      if (this.isPaymasterApiKeyError(message)) {
        throw new PaymasterServiceError(message);
      }
      const messageLC = message.toLowerCase();
      if (messageLC.includes('u256_sub overflow')
        || messageLC.includes('u256_add overflow')
        || messageLC.includes('balance is too low')
        || messageLC.includes('insufficient token from amount')) {
        throw new InsufficientBalanceError();
      }
      throw new ExternalServiceError(
        'AVNU Paymaster',
        `SNIP-29 buildTransaction failed: ${message}`,
      );
    }
  }

  /**
   * Executes a signed invoke transaction via SNIP-29 paymaster_executeTransaction.
   * The signature must be in Argent compact_no_legacy format.
   */
  async executeInvokeTransaction(params: {
    typedData: unknown;
    signature: string[];
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult> {
    const accountAddress = params.accountAddress.toString();
    const logMsg = 'Executing signed invoke via SNIP-29';
    if (this.log.isLevelEnabled("debug")) {
      this.log.debug({accountAddress, signatureLength: params.signature.length}, logMsg);
    } else {
      this.log.info(logMsg);
    }
    try {
      const payload: ExecutableUserTransaction = {
        type: 'invoke' as const,
        invoke: {
          userAddress: accountAddress,
          typedData: params.typedData as WALLET_API.OutsideExecutionTypedData,
          signature: params.signature,
        },
      };

      const parameters: ExecutionParameters = {
        feeMode: {mode: 'sponsored' as const},
        version: '0x1' as const,
      };

      const response = await this.paymasterRpc.executeTransaction(payload, parameters);
      const logMsg = 'SNIP-29 invoke transaction submitted';
      if (this.log.isLevelEnabled("debug")) {
        this.log.debug({txHash: response.transaction_hash}, logMsg);
      } else {
        this.log.info(logMsg);
      }
      return {
        txHash: response.transaction_hash,
        success: true,
      };
    } catch (err) {
      if (err instanceof ExternalServiceError || err instanceof PaymasterServiceError) {
        throw err;
      }
      const message = err instanceof Error
        ? err.message
        : String(err);
      if (this.isPaymasterApiKeyError(message)) {
        throw new PaymasterServiceError(message);
      }
      throw new ExternalServiceError(
        'AVNU Paymaster',
        `SNIP-29 executeTransaction failed: ${message}`,
      );
    }
  }

  // ===========================================================================
  // SNIP-29 Deploy (direct execution, no client signing)
  // ===========================================================================

  /**
   * Deploys an account via SNIP-29 JSON-RPC (paymaster_executeTransaction).
   *
   * Deploy transactions don't require client-side signing because the account
   * doesn't exist yet. The paymaster submits the DEPLOY_ACCOUNT transaction.
   *
   * Uses 'sponsored' fee mode (dApp pays gas via AVNU). Requires AVNU_API_KEY
   * (free at https://portal.avnu.fi) — sponsored mode is rate-limited without one.
   * IMPORTANT: the x-paymaster-api-key header must be omitted entirely when
   * no key is configured — sending an empty value triggers error 163.
   */
  private async executeDeployViaSNIP29(
    tx: DeployTransaction,
    accountAddress: StarknetAddress,
  ): Promise<PaymasterResult> {
    try {
      this.log.info({accountAddress: accountAddress.toString()},
        'Deploying account via SNIP-29');
      const rpcBody = {
        jsonrpc: '2.0',
        method: 'paymaster_executeTransaction',
        params: {
          transaction: {
            type: 'deploy',
            deployment: {
              address: accountAddress.toString(),
              class_hash: tx.classHash,
              salt: tx.salt,
              calldata: tx.constructorCallData,
              version: 1,
            },
          },
          parameters: {
            version: '0x1',
            fee_mode: {mode: 'sponsored'},
          },
        },
        id: 1,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': '*/*',
      };
      if (this.config.apiKey) {
        headers['x-paymaster-api-key'] = this.config.apiKey;
      }

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(rpcBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new ExternalServiceError(
          'AVNU Paymaster',
          `SNIP-29 deploy failed (HTTP ${response.status}): ${error}`,
        );
      }

      const result = await response.json() as SNIP29ExecuteResponse;

      if (result.error) {
        const errorData = result.error.data ? ` (${JSON.stringify(result.error.data)})` : '';
        const fullMessage = `${result.error.code}: ${result.error.message}${errorData}`;
        if (this.isPaymasterApiKeyError(fullMessage)) {
          throw new PaymasterServiceError(fullMessage);
        }
        throw new ExternalServiceError(
          'AVNU Paymaster',
          `SNIP-29 deploy RPC error ${fullMessage}`,
        );
      }

      if (!result.result?.transaction_hash) {
        throw new ExternalServiceError(
          'AVNU Paymaster',
          `SNIP-29 deploy returned no transaction_hash: ${JSON.stringify(result)}`,
        );
      }

      this.log.info({txHash: result.result.transaction_hash}, 'SNIP-29 deploy transaction submitted');
      return {
        txHash: result.result.transaction_hash,
        success: true,
      };
    } catch (err) {
      if (err instanceof PaymasterServiceError || err instanceof ExternalServiceError) {
        this.log.error({err}, 'SNIP-29 deploy failed');
        throw err;
      }
      throw new ExternalServiceError(
        'AVNU Paymaster',
        `SNIP-29 deploy failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ===========================================================================
  // Legacy methods (kept for backward compatibility)
  // ===========================================================================

  async buildPaymasterTransaction(params: {
    transaction: StarknetTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterTransaction> {
    this.log.debug({accountAddress: params.accountAddress.toString()},
      'Building paymaster transaction');
    try {
      const response = await fetch(`${this.config.apiUrl}/paymaster/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
        },
        body: JSON.stringify({
          transaction: params.transaction,
          accountAddress: params.accountAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new ExternalServiceError('AVNU Paymaster', `Build failed: ${error}`);
      }
      return await response.json() as PaymasterTransaction;
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        'AVNU Paymaster',
        `Build failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async isAvailable(accountAddress: StarknetAddress): Promise<boolean> {
    this.log.debug({accountAddress: accountAddress.toString()}, 'Checking paymaster availability');
    let available = false;
    try {
      const response = await fetch(
        `${this.config.apiUrl}/paymaster/available?address=${accountAddress}`,
        {
          headers: {
            'X-API-Key': this.config.apiKey,
          },
        },
      );
      if (response.ok) {
        const result = await response.json() as { available: boolean };
        available = result.available;
      } else {
        this.log.warn({status: response.status},
          'Paymaster availability check failed');
      }
    } catch {
      // network error → available stays false
    }
    this.log.debug({available}, 'Paymaster availability result');
    return available;
  }

  async getRemainingCredits(): Promise<bigint> {
    this.log.debug('Fetching AVNU remaining sponsor credits');
    if (!this.config.apiKey) {
      throw new ExternalServiceError(
        'AVNU Paymaster',
        'Cannot fetch remaining credits: AVNU_API_KEY is not configured',
      );
    }

    try {
      const response = await fetch(this.config.sponsorActivityUrl, {
        headers: {'api-key': this.config.apiKey},
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ExternalServiceError(
          'AVNU Paymaster',
          `sponsor-activity failed (HTTP ${response.status}): ${body}`,
        );
      }

      const body = await response.json() as SponsorActivityResponse;
      if (body.remainingStrkCredits === undefined) {
        throw new ExternalServiceError(
          'AVNU Paymaster',
          'sponsor-activity response missing remainingStrkCredits',
        );
      }

      const credits = BigInt(body.remainingStrkCredits);
      this.log.debug({credits: credits.toString()}, 'AVNU remaining sponsor credits fetched');
      return credits;
    } catch (err: unknown) {
      if (err instanceof ExternalServiceError) {
        throw err;
      }
      throw new ExternalServiceError(
        'AVNU Paymaster',
        `sponsor-activity failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getSponsoredGasLimit(): Promise<bigint> {
    this.log.debug('Getting sponsored gas limit');
    let gasLimit = 0n;
    try {
      const response = await fetch(`${this.config.apiUrl}/paymaster/limits`, {
        headers: {
          'X-API-Key': this.config.apiKey,
        },
      });

      if (response.ok) {
        const result = await response.json() as { gasLimit: string };
        gasLimit = BigInt(result.gasLimit);
      } else {
        this.log.warn({status: response.status},
          `Sponsored gas limit request failed (use ${gasLimit} as limit)`);
      }
    } catch {
      // network error → gasLimit stays 0n
    }
    this.log.debug({gasLimit: gasLimit.toString()}, 'Sponsored gas limit result');
    return gasLimit;
  }
}

function sanitizeAvnuError(err: unknown): SanitizedError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  // AVNU-specific: error 163 returned when API key is invalid or credits are exhausted.
  if (lower.includes('163') && lower.includes('api-key')) {
    return {kind: 'unknown', summary: `AVNU API key invalid or credits exhausted (error 163): ${message}`};
  }
  // AVNU-specific: local check when AVNU_API_KEY env var is absent.
  if (lower.includes('not configured')) {
    return {kind: 'unknown', summary: message};
  }
  // AVNU-specific: structured HTTP error carries the status code in the message.
  const httpMatch = /http (\d{3})/i.exec(message);
  if (httpMatch) {
    const httpCode = Number.parseInt(httpMatch[1]!, 10);
    return {kind: 'html_response', httpCode, summary: `AVNU paymaster HTTP ${httpCode}`};
  }
  return SanitizedError.sanitize('AVNU paymaster', err);
}
