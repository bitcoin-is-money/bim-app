import type {StarknetCall} from '../ports/starknet.gateway';
import {UnsafeExternalCallError} from './errors';

/**
 * Entrypoints that can directly move tokens out of the user's account.
 * These must NEVER appear in calls returned by external services (Atomiq, AVNU).
 *
 * BIM's own transfer calls are built internally by Erc20CallFactory and appended
 * separately — they never pass through this validator.
 */
const FORBIDDEN_ENTRYPOINTS = new Set([
  'transfer',
  'transfer_from',
  'send',
  'increase_allowance',
]);

/**
 * Validates that calls from an external service do not contain dangerous operations.
 *
 * Two checks:
 * 1. No call may use a forbidden entrypoint (e.g. `transfer`) — this blocks the
 *    simplest fund-drain attack where a compromised service injects a direct transfer.
 * 2. Every `approve` call must target a known token contract — this ensures the
 *    service cannot trick the user into approving a malicious token-like contract.
 *
 * @param calls - The calls returned by the external service
 * @param knownTokenAddresses - Token contract addresses known to the system (WBTC, STRK, etc.)
 * @param serviceName - Name of the external service (for error messages)
 */
export function validateExternalCalls(
  calls: readonly StarknetCall[],
  knownTokenAddresses: readonly string[],
  serviceName: string,
): void {
  const normalizedTokens = new Set(
    knownTokenAddresses.map(addr => addr.toLowerCase()),
  );

  for (const call of calls) {
    const entrypoint = call.entrypoint.toLowerCase();

    // 1. Block forbidden entrypoints
    if (FORBIDDEN_ENTRYPOINTS.has(entrypoint)) {
      throw new UnsafeExternalCallError(
        serviceName,
        `Forbidden entrypoint '${call.entrypoint}' on contract ${call.contractAddress}`,
      );
    }

    // 2. Approve calls must target a known token contract
    if (entrypoint === 'approve') {
      if (!normalizedTokens.has(call.contractAddress.toLowerCase())) {
        throw new UnsafeExternalCallError(
          serviceName,
          `Approve call targets unknown contract ${call.contractAddress}`,
        );
      }
    }
  }
}

