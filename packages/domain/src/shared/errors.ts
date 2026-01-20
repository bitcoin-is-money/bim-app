/**
 * Base domain error class.
 * All domain-specific errors should extend this class.
 */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when an entity is not found.
 */
export class NotFoundError extends DomainError {
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
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid state transition from '${from}' to '${to}'`);
  }
}

/**
 * Error thrown when validation fails.
 */
export class ValidationError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(`Validation failed for '${field}': ${reason}`);
  }
}

/**
 * Error thrown when an operation is not authorized.
 */
export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Unauthorized') {
    super(message);
  }
}

/**
 * Error thrown when a resource already exists.
 */
export class AlreadyExistsError extends DomainError {
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
  constructor(
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`);
  }
}

/**
 * Error thrown when an external service fails.
 */
export class ExternalServiceError extends DomainError {
  constructor(
    readonly service: string,
    readonly reason: string,
  ) {
    super(`External service '${service}' failed: ${reason}`);
  }
}
