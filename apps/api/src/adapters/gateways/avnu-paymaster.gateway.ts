import type {StarknetAddress} from "@bim/domain/account";
import type {
  DeployTransaction,
  PaymasterGateway,
  PaymasterResult,
  PaymasterTransaction,
  StarknetTransaction
} from "@bim/domain/ports";
import {ExternalServiceError} from "@bim/domain/shared";

/**
 * Configuration for AVNU Paymaster gateway.
 */
export interface AvnuPaymasterConfig {
  apiUrl: string;
  apiKey: string;
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
 * Deploy path uses SNIP-29 JSON-RPC (paymaster_executeTransaction).
 * Invoke path uses legacy REST API (TODO: migrate to SNIP-29 build/sign/execute).
 */
export class AvnuPaymasterGateway implements PaymasterGateway {
  constructor(private readonly config: AvnuPaymasterConfig) {}

  async executeTransaction(params: {
    transaction: StarknetTransaction | DeployTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult> {
    if (params.transaction.type === 'DEPLOY_ACCOUNT') {
      return this.executeDeployViaSNIP29(
        params.transaction as DeployTransaction,
        params.accountAddress,
      );
    }

    // TODO: Migrate invoke path to SNIP-29 build/sign/execute flow.
    // This requires frontend WebAuthn signing of OutsideExecutionTypedData.
    return this.executeInvokeViaREST(
      params.transaction as StarknetTransaction,
      params.accountAddress,
    );
  }

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
        throw new ExternalServiceError(
          'AVNU Paymaster',
          `SNIP-29 deploy RPC error ${result.error.code}: ${result.error.message}${errorData}`,
        );
      }

      if (!result.result?.transaction_hash) {
        throw new ExternalServiceError(
          'AVNU Paymaster',
          `SNIP-29 deploy returned no transaction_hash: ${JSON.stringify(result)}`,
        );
      }

      return {
        txHash: result.result.transaction_hash,
        success: true,
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        'AVNU Paymaster',
        `SNIP-29 deploy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Executes an invoke transaction via the legacy REST API.
   * TODO: Migrate to SNIP-29 build/sign/execute flow.
   */
  private async executeInvokeViaREST(
    tx: StarknetTransaction,
    accountAddress: StarknetAddress,
  ): Promise<PaymasterResult> {
    try {
      const response = await fetch(`${this.config.apiUrl}/paymaster/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
        },
        body: JSON.stringify({
          transaction: tx,
          accountAddress: accountAddress.toString(),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new ExternalServiceError('AVNU Paymaster', `Execute failed: ${error}`);
      }

      const result = await response.json() as { txHash: string; success: boolean };

      return {
        txHash: result.txHash,
        success: result.success,
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        'AVNU Paymaster',
        `Execute failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async buildPaymasterTransaction(params: {
    transaction: StarknetTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterTransaction> {
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

      const result = await response.json() as PaymasterTransaction;

      return result;
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
    try {
      const response = await fetch(
        `${this.config.apiUrl}/paymaster/available?address=${accountAddress}`,
        {
          headers: {
            'X-API-Key': this.config.apiKey,
          },
        },
      );

      if (!response.ok) {
        return false;
      }

      const result = await response.json() as { available: boolean };
      return result.available;
    } catch {
      return false;
    }
  }

  async getSponsoredGasLimit(): Promise<bigint> {
    try {
      const response = await fetch(`${this.config.apiUrl}/paymaster/limits`, {
        headers: {
          'X-API-Key': this.config.apiKey,
        },
      });

      if (!response.ok) {
        return 0n;
      }

      const result = await response.json() as { gasLimit: string };
      return BigInt(result.gasLimit);
    } catch {
      return 0n;
    }
  }
}
