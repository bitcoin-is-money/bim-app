import {DomainError} from '../shared';

export class UnsupportedCurrencyError extends DomainError {
  constructor(readonly currency: string, supportedCurrencies: readonly string[]) {
    super(`Unsupported currency: ${currency}. Supported: ${supportedCurrencies.join(', ')}`);
  }
}
