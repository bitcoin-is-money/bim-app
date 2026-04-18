import {ErrorCode} from './error-codes';

/**
 * Base domain error class.
 * All domain-specific errors should extend this class.
 */
export abstract class DomainError extends Error {
  abstract readonly errorCode: ErrorCode;

  /** i18n interpolation args sent to the frontend. Override in subclasses that carry context. */
  get args(): Record<string, string | number> | undefined {
    return undefined;
  }

  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when an entity is not found.
 */
export class NotFoundError extends DomainError {
  readonly errorCode = ErrorCode.INTERNAL_ERROR;

  constructor(
    readonly entityType: string,
    readonly identifier: string,
  ) {
    super(`${entityType} not found: ${identifier}`);
  }
}

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidStateTransitionError extends DomainError {
  readonly errorCode = ErrorCode.INVALID_ACCOUNT_STATE;

  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid state transition from '${from}' to '${to}'`);
  }

  override get args(): Record<string, string> {
    return {from: this.from, to: this.to};
  }
}

/**
 * Error thrown when validation fails.
 */
export class ValidationError extends DomainError {
  readonly errorCode = ErrorCode.VALIDATION_ERROR;

  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(`Validation failed for '${field}': ${reason}`);
  }

  override get args(): Record<string, string> {
    return {field: this.field, reason: this.reason};
  }
}

/**
 * Error thrown when an operation is not authorized.
 */
export class UnauthorizedError extends DomainError {
  readonly errorCode = ErrorCode.UNAUTHORIZED;

  constructor(message = 'Unauthorized') {
    super(message);
  }
}

/**
 * Error thrown when a resource already exists.
 */
export class AlreadyExistsError extends DomainError {
  readonly errorCode = ErrorCode.INTERNAL_ERROR;

  constructor(
    readonly entityType: string,
    readonly identifier: string,
  ) {
    super(`${entityType} already exists: ${identifier}`);
  }
}

/**
 * Error thrown when an operation times out.
 */
export class TimeoutError extends DomainError {
  readonly errorCode = ErrorCode.TIMEOUT_ERROR;

  constructor(
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`);
  }

  override get args(): Record<string, string | number> {
    return {operation: this.operation};
  }
}

/**
 * Error thrown when a transaction fails due to insufficient token balance.
 * Optionally carries the required amount and token address so the frontend
 * can display a helpful message.
 */
export class InsufficientBalanceError extends DomainError {
  get errorCode(): ErrorCode {
    if (this.reason === 'security_deposit') return ErrorCode.INSUFFICIENT_BALANCE_SECURITY_DEPOSIT;
    if (this.requiredAmount !== undefined) return ErrorCode.INSUFFICIENT_BALANCE_WITH_AMOUNT;
    return ErrorCode.INSUFFICIENT_BALANCE;
  }

  constructor(
    readonly requiredAmount?: bigint,
    readonly tokenAddress?: string,
    readonly reason?: 'transfer' | 'security_deposit',
    readonly tokenSymbol?: string,
    readonly tokenDecimals?: number,
  ) {
    super(InsufficientBalanceError.buildMessage(reason, requiredAmount, tokenSymbol, tokenDecimals));
  }

  private static buildMessage(
    reason: 'transfer' | 'security_deposit' | undefined,
    requiredAmount: bigint | undefined,
    tokenSymbol: string | undefined,
    tokenDecimals: number | undefined,
  ): string {
    if (reason === 'security_deposit') {
      const symbol = tokenSymbol ?? 'STRK';
      if (requiredAmount !== undefined) {
        const formatted = formatTokenAmount(requiredAmount, tokenDecimals ?? 18);
        return `Insufficient balance to cover the security deposit (~${formatted} ${symbol}). Fund your account before retrying.`;
      }
      return 'Insufficient balance to cover the security deposit. Fund your account before retrying.';
    }
    if (requiredAmount !== undefined) {
      const formatted = formatTokenAmount(requiredAmount, 18);
      return `Insufficient balance. This operation requires ~${formatted} STRK.`;
    }
    return 'Insufficient balance for this operation';
  }

  override get args(): Record<string, string> | undefined {
    if (this.reason === 'security_deposit') {
      const decimals = this.tokenDecimals ?? 18;
      const symbol = this.tokenSymbol ?? 'STRK';
      if (this.requiredAmount !== undefined) {
        return {amount: formatTokenAmount(this.requiredAmount, decimals), token: symbol};
      }
      return undefined;
    }
    if (this.requiredAmount !== undefined) {
      return {amount: formatTokenAmount(this.requiredAmount, 18)};
    }
    return undefined;
  }
}

/**
 * Error thrown when an external service fails.
 */
export class ExternalServiceError extends DomainError {
  readonly errorCode = ErrorCode.EXTERNAL_SERVICE_ERROR;

  constructor(
    readonly service: string,
    readonly reason: string,
  ) {
    super(`External service '${service}' failed: ${reason}`);
  }

  override get args(): Record<string, string> {
    return {service: this.service};
  }
}

/**
 * Error thrown when the paymaster service is misconfigured or unavailable
 * (e.g. invalid API key, exhausted credits).
 */
export class PaymasterServiceError extends DomainError {
  readonly errorCode = ErrorCode.PAYMASTER_SERVICE_ERROR;

  constructor(readonly reason: string) {
    super(`Paymaster service error: ${reason}`);
  }

  override get args(): Record<string, string> {
    return {reason: this.reason};
  }
}

/**
 * Thrown when an external service returns calls that fail safety validation.
 * This indicates either a compromised service or an unexpected protocol change.
 */
export class UnsafeExternalCallError extends DomainError {
  readonly errorCode = ErrorCode.EXTERNAL_SERVICE_ERROR;

  constructor(
    readonly service: string,
    readonly reason: string,
  ) {
    super(`Unsafe call from '${service}': ${reason}`);
  }

  override get args(): Record<string, string> {
    return {service: this.service};
  }
}

/**
 * Format a raw token amount (in wei) to a human-readable string.
 * E.g. 4_140_000_000_000_000_000n with 18 decimals -> "4.14"
 */
function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  if (remainder === 0n) return whole.toString();
  const fracStr = remainder.toString().padStart(decimals, '0').replaceAll(/0{1,18}$/g, '');
  return `${whole}.${fracStr}`;
}
