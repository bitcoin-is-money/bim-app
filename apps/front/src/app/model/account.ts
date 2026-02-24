export type AccountStatus = 'pending' | 'deploying' | 'deployed' | 'failed';

export interface Account {
  id: string;
  username: string;
  starknetAddress: string | null;
  status: AccountStatus;
}

