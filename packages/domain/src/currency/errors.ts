import {DomainError, ErrorCode} from '../shared';

export class UnsupportedCurrencyError extends DomainError {
  readonly errorCode = ErrorCode.UNSUPPORTED_CURRENCY;

  constructor(readonly currency: string, supportedCurrencies: readonly string[]) {
    super(`Unsupported currency: ${currency}. Supported: ${supportedCurrencies.join(', ')}`);
  }

  override get args(): Record<string, string> {
    return {currency: this.currency};
  }
}
