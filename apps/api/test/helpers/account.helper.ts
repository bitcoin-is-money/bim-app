import type {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {DeployAccountResponse} from '../../src/routes';
import {registerUser, type TestRequester} from './auth.helper';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a full registration and deployment flow.
 */
export interface RegisterAndDeployResult {
  sessionCookie: string;
  starknetAddress: string;
}

/**
 * Dependencies needed by registerAndDeployUser.
 */
export interface DeployDeps {
  requester: TestRequester;
  authenticator: WebauthnVirtualAuthenticator;
  waitForTransaction: (txHash: string) => Promise<void>;
}

// =============================================================================
// Registration + Deployment flow
// =============================================================================

/**
 * Registers a user via WebAuthn and deploys the account.
 * Waits for on-chain confirmation before returning.
 * Works with both TestApp (devnet) and TestnetApp (Sepolia) requesters.
 */
export async function registerAndDeployUser(
  deps: DeployDeps,
  username: string,
): Promise<RegisterAndDeployResult> {
  const {sessionCookie} = await registerUser(deps.requester, deps.authenticator, username);

  const deployResponse = await deps.requester.post('/api/account/deploy', {}, {
    headers: {Cookie: sessionCookie},
  });

  if (deployResponse.status !== 200) {
    const errorBody = await deployResponse.text();
    throw new Error(`Deployment failed (HTTP ${deployResponse.status}): ${errorBody}`);
  }

  const deployBody = await deployResponse.json() as DeployAccountResponse;

  // Wait for on-chain confirmation
  await deps.waitForTransaction(deployBody.txHash);
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {sessionCookie, starknetAddress: deployBody.starknetAddress};
}
