/**
 * API response type from GET /api/account/me
 */
export interface GetAccountResponse {
  id: string;
  username: string;
  starknetAddress: string | null;
  status: string;
  deploymentTxHash: string | null;
  createdAt: string;
}

/**
 * API request body for POST /api/account/deploy
 */
export interface DeployAccountRequest {
  /** If true, wait for on-chain confirmation before returning. Default: false */
  sync?: boolean;
}

/**
 * API response type from POST /api/account/deploy
 */
export interface DeployAccountResponse {
  txHash: string;
  status: string;
  starknetAddress: string;
}

/**
 * API response type from GET /api/account/deployment-status
 */
export interface GetDeploymentStatusResponse {
  status: string;
  txHash: string | null;
  isDeployed: boolean;
}

/**
 * API response type from GET /api/account/balance
 */
export interface GetBalanceResponse {
  wbtcBalance: {
    symbol: string;
    amount: string;
    decimals: number;
  };
  strkBalance: {
    symbol: string;
    amount: string;
    decimals: number;
  };
}
