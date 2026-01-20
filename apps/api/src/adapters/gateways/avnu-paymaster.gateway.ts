import type {
  DeployTransaction,
  PaymasterGateway,
  PaymasterResult,
  PaymasterTransaction,
  StarknetTransaction,
} from '@bim/domain';
import {ExternalServiceError, StarknetAddress} from '@bim/domain';

/**
 * Configuration for AVNU Paymaster gateway.
 */
export interface AvnuPaymasterConfig {
  apiUrl: string;
  apiKey: string;
}

/**
 * AVNU Paymaster gateway implementation for gasless transactions.
 */
export class AvnuPaymasterGateway implements PaymasterGateway {
  constructor(private readonly config: AvnuPaymasterConfig) {}

  async executeTransaction(params: {
    transaction: StarknetTransaction | DeployTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult> {
    try {
      const response = await fetch(`${this.config.apiUrl}/paymaster/execute`, {
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
