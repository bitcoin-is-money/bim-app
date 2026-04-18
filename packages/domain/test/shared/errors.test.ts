import {
  AlreadyExistsError,
  DomainError,
  ErrorCode,
  ExternalServiceError,
  InvalidStateTransitionError,
  NotFoundError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from '@bim/domain/shared';
import {describe, expect, it} from 'vitest';

describe('DomainError', () => {
  it('should be Error', () => {
    class SampleError extends DomainError {
      readonly errorCode = ErrorCode.INTERNAL_ERROR;
      constructor() {
        super('sample');
      }
    }
    const error = new SampleError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  it('extends DomainError', () => {
    const error = new NotFoundError('Entity', 'id');
    expect(error).toBeInstanceOf(DomainError);
  });

  it('formats message with entity type and identifier', () => {
    const error = new NotFoundError('Account', 'account-123');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.message).toBe('Account not found: account-123');
  });

  it('exposes entityType and identifier', () => {
    const error = new NotFoundError('User', 'user-456');
    expect(error.entityType).toBe('User');
    expect(error.identifier).toBe('user-456');
  });
});

describe('InvalidStateTransitionError', () => {
  it('extends DomainError', () => {
    const error = new InvalidStateTransitionError('pending', 'deployed');
    expect(error).toBeInstanceOf(DomainError);
  });

  it('formats message with from and to states', () => {
    const error = new InvalidStateTransitionError('pending', 'deployed');
    expect(error.message).toBe("Invalid state transition from 'pending' to 'deployed'");
  });

  it('exposes from and to states', () => {
    const error = new InvalidStateTransitionError('active', 'inactive');
    expect(error.from).toBe('active');
    expect(error.to).toBe('inactive');
  });
});

describe('ValidationError', () => {
  it('extends DomainError', () => {
    const error = new ValidationError('email', 'must be valid email');
    expect(error).toBeInstanceOf(DomainError);
  });

  it('formats message with field and reason', () => {
    const error = new ValidationError('email', 'must be valid email');
    expect(error.message).toBe("Validation failed for 'email': must be valid email");
  });

  it('exposes field and reason', () => {
    const error = new ValidationError('username', 'too short');
    expect(error.field).toBe('username');
    expect(error.reason).toBe('too short');
  });
});

describe('UnauthorizedError', () => {
  it('extends DomainError', () => {
    const error = new UnauthorizedError();
    expect(error).toBeInstanceOf(DomainError);
  });

  it('uses default message when none provided', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Unauthorized');
  });

  it('uses custom message when provided', () => {
    const error = new UnauthorizedError('Invalid token');
    expect(error.message).toBe('Invalid token');
  });
});

describe('AlreadyExistsError', () => {
  it('extends DomainError', () => {
    const error = new AlreadyExistsError('User', 'alice');
    expect(error).toBeInstanceOf(DomainError);
  });

  it('formats message with entity type and identifier', () => {
    const error = new AlreadyExistsError('User', 'alice');
    expect(error.message).toBe('User already exists: alice');
  });

  it('exposes entityType and identifier', () => {
    const error = new AlreadyExistsError('Account', 'test@example.com');
    expect(error.entityType).toBe('Account');
    expect(error.identifier).toBe('test@example.com');
  });
});

describe('TimeoutError', () => {
  it('extends DomainError', () => {
    const error = new TimeoutError('database query', 5000);
    expect(error).toBeInstanceOf(DomainError);
  });

  it('formats message with operation and timeout', () => {
    const error = new TimeoutError('database query', 5000);
    expect(error.message).toBe("Operation 'database query' timed out after 5000ms");
  });

  it('exposes operation and timeoutMs', () => {
    const error = new TimeoutError('api call', 10000);
    expect(error.operation).toBe('api call');
    expect(error.timeoutMs).toBe(10000);
  });
});

describe('ExternalServiceError', () => {
  it('extends DomainError', () => {
    const error = new ExternalServiceError('', '');
    expect(error).toBeInstanceOf(DomainError);
  });

  it('formats message with service and reason', () => {
    const error = new ExternalServiceError('Starknet RPC', 'connection refused');
    expect(error.message).toBe("External service 'Starknet RPC' failed: connection refused");
  });

  it('exposes service and reason', () => {
    const error = new ExternalServiceError('Payment Gateway', 'invalid response');
    expect(error.service).toBe('Payment Gateway');
    expect(error.reason).toBe('invalid response');
  });
});
