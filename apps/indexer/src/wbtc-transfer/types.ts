export interface TransferEvent {
  from: string;
  to: string;
  amount: string;
  txHash: string;
}

export interface AccountMatch {
  id: string;
  starknetAddress: string;
}
