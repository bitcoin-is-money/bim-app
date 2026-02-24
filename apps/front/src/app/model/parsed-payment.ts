import type {ParsePaymentResponse, PaymentNetwork} from '../services/pay.http.service';
import {Amount} from './amount';

export class ParsedPayment {
  private constructor(
    readonly network: PaymentNetwork,
    readonly amount: Amount,
    readonly fee: Amount,
    readonly description: string,
    readonly destination: string,
    readonly expiresAt?: Date,
    readonly tokenAddress?: string,
  ) {}

  static fromResponse(response: ParsePaymentResponse): ParsedPayment {
    const amount = Amount.of(response.amount.value, response.amount.currency);
    const fee = Amount.of(response.fee.value, response.amount.currency);

    let destination: string;
    let expiresAt: Date | undefined;
    let tokenAddress: string | undefined;

    switch (response.network) {
      case 'lightning':
        destination = response.invoice;
        expiresAt = response.expiresAt ? new Date(response.expiresAt) : undefined;
        break;
      case 'bitcoin':
        destination = response.address;
        break;
      case 'starknet':
        destination = response.address;
        tokenAddress = response.tokenAddress;
        break;
    }

    return new ParsedPayment(
      response.network,
      amount,
      fee,
      response.description,
      destination,
      expiresAt,
      tokenAddress,
    );
  }

  get shortDestination(): string {
    if (this.destination.length <= 20) return this.destination;
    return `${this.destination.slice(0, 20)}...${this.destination.slice(-10)}`;
  }
}
