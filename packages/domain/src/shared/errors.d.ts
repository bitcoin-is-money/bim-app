/**
 * Base domain error class.
 * All domain-specific errors should extend this class.
 */
export declare abstract class DomainError extends Error {
    protected constructor(message: string);
}
/**
 * Error thrown when an entity is not found.
 */
export declare class NotFoundError extends DomainError {
    readonly entityType: string;
    readonly identifier: string;
    constructor(entityType: string, identifier: string);
}
/**
 * Error thrown when an invalid state transition is attempted.
 */
export declare class InvalidStateTransitionError extends DomainError {
    readonly from: string;
    readonly to: string;
    constructor(from: string, to: string);
}
/**
 * Error thrown when validation fails.
 */
export declare class ValidationError extends DomainError {
    readonly field: string;
    readonly reason: string;
    constructor(field: string, reason: string);
}
/**
 * Error thrown when an operation is not authorized.
 */
export declare class UnauthorizedError extends DomainError {
    constructor(message?: string);
}
/**
 * Error thrown when a resource already exists.
 */
export declare class AlreadyExistsError extends DomainError {
    readonly entityType: string;
    readonly identifier: string;
    constructor(entityType: string, identifier: string);
}
/**
 * Error thrown when an operation times out.
 */
export declare class TimeoutError extends DomainError {
    readonly operation: string;
    readonly timeoutMs: number;
    constructor(operation: string, timeoutMs: number);
}
/**
 * Error thrown when an external service fails.
 */
export declare class ExternalServiceError extends DomainError {
    readonly service: string;
    readonly reason: string;
    constructor(service: string, reason: string);
}
//# sourceMappingURL=errors.d.ts.map