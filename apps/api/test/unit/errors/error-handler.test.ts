import {
  AccountAlreadyExistsError,
  AccountDeploymentError,
  AccountId,
  AccountNotFoundError,
  InvalidAccountStateError,
  InvalidStarknetAddressError,
  InvalidUsernameError
} from '@bim/domain/account';
import {
  AuthenticationFailedError,
  ChallengeAlreadyUsedError,
  ChallengeExpiredError,
  ChallengeId,
  ChallengeNotFoundError,
  InvalidChallengeError,
  RegistrationFailedError,
  SessionExpiredError,
  SessionId,
  SessionNotFoundError
} from '@bim/domain/auth';
import {UnsupportedCurrencyError} from '@bim/domain/currency';
import {
  InvalidPaymentAddressError,
  InvalidPaymentAmountError,
  PaymentParsingError,
  SameAddressPaymentError,
  UnsupportedNetworkError,
  UnsupportedTokenError
} from '@bim/domain/payment';
import {
  Amount,
  ExternalServiceError,
  InsufficientBalanceError,
  InvalidStateTransitionError,
  PaymasterServiceError,
  TimeoutError,
  UnauthorizedError,
  UnsafeExternalCallError,
  ValidationError
} from '@bim/domain/shared';
import {
  BitcoinAddressNetworkMismatchError,
  InvalidBitcoinAddressError,
  InvalidLightningInvoiceError,
  InvalidSwapStateError,
  LightningInvoiceExpiredError,
  SwapAmountError,
  SwapCreationError,
  SwapExpiredError,
  SwapId,
  SwapNotFoundError,
  SwapOwnershipError
} from '@bim/domain/swap';
import {UserSettingsNotFoundError} from '@bim/domain/user';
import {createLogger} from '@bim/lib/logger';
import type {Context} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ZodError} from 'zod';
import {ErrorCode, handleDomainError} from '../../../src/errors';

const logger = createLogger('silent');

const ACCOUNT_ID = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
const SWAP_ID = SwapId.of('660e8400-e29b-41d4-a716-446655440001');
const SESSION_ID = SessionId.of('770e8400-e29b-41d4-a716-446655440002');
const CHALLENGE_ID = ChallengeId.of('880e8400-e29b-41d4-a716-446655440003');

interface CapturedResponse {
  status: number;
  body: {error: {code: string; message: string; args?: Record<string, unknown>}};
}

function createCtx(): {ctx: Context; captured: CapturedResponse} {
  const captured: CapturedResponse = {status: 0, body: {error: {code: '', message: ''}}};
  const ctx = {
    json: vi.fn((body: unknown, status: number) => {
      captured.body = body as CapturedResponse['body'];
      captured.status = status;
      return body;
    }),
  } as unknown as Context;
  return {ctx, captured};
}

describe('handleDomainError', () => {
  let ctx: Context;
  let captured: CapturedResponse;

  beforeEach(() => {
    ({ctx, captured} = createCtx());
  });

  // ===========================================================================
  describe('Special cases', () => {
    it('handles SwapNotFoundError without logging error stack (warn-only)', () => {
      handleDomainError(ctx, new SwapNotFoundError(SWAP_ID), logger);
      expect(captured.status).toBe(404);
      expect(captured.body.error.code).toBe(ErrorCode.SWAP_NOT_FOUND);
      expect(captured.body.error.args?.swapId).toBe(SWAP_ID);
    });

    it('handles ZodError', () => {
      const zodError = new ZodError([{code: 'invalid_type', expected: 'string', input: 42, path: ['username'], message: 'Expected string'}]);
      handleDomainError(ctx, zodError, logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(captured.body.error.args?.field).toBe('username');
    });

    it('falls back to INTERNAL_ERROR for unknown errors', () => {
      handleDomainError(ctx, new Error('boom'), logger);
      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  // ===========================================================================
  describe('Account errors', () => {
    it('AccountNotFoundError → 404', () => {
      handleDomainError(ctx, new AccountNotFoundError(ACCOUNT_ID), logger);
      expect(captured.status).toBe(404);
      expect(captured.body.error.code).toBe(ErrorCode.ACCOUNT_NOT_FOUND);
    });

    it('AccountAlreadyExistsError → 409 with username', () => {
      handleDomainError(ctx, new AccountAlreadyExistsError('alice'), logger);
      expect(captured.status).toBe(409);
      expect(captured.body.error.args?.username).toBe('alice');
    });

    it('InvalidUsernameError → 400 with username', () => {
      handleDomainError(ctx, new InvalidUsernameError('!!'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.username).toBe('!!');
    });

    it('InvalidAccountStateError → 400', () => {
      handleDomainError(ctx, new InvalidAccountStateError('pending', 'deploy', 'must be deployed'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.INVALID_ACCOUNT_STATE);
    });

    it('AccountDeploymentError → 500', () => {
      handleDomainError(ctx, new AccountDeploymentError(ACCOUNT_ID, 'paymaster failed'), logger);
      expect(captured.status).toBe(500);
    });

    it('InvalidStarknetAddressError → 400', () => {
      handleDomainError(ctx, new InvalidStarknetAddressError('bad'), logger);
      expect(captured.status).toBe(400);
    });
  });

  // ===========================================================================
  describe('Auth errors', () => {
    it('ChallengeNotFoundError → 400', () => {
      handleDomainError(ctx, new ChallengeNotFoundError(CHALLENGE_ID), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.CHALLENGE_NOT_FOUND);
    });

    it('ChallengeExpiredError → 400', () => {
      handleDomainError(ctx, new ChallengeExpiredError(CHALLENGE_ID), logger);
      expect(captured.status).toBe(400);
    });

    it('ChallengeAlreadyUsedError → 400', () => {
      handleDomainError(ctx, new ChallengeAlreadyUsedError(CHALLENGE_ID), logger);
      expect(captured.status).toBe(400);
    });

    it('InvalidChallengeError → 400', () => {
      handleDomainError(ctx, new InvalidChallengeError(CHALLENGE_ID, 'bad'), logger);
      expect(captured.status).toBe(400);
    });

    it('AuthenticationFailedError → 401', () => {
      handleDomainError(ctx, new AuthenticationFailedError('bad sig'), logger);
      expect(captured.status).toBe(401);
    });

    it('RegistrationFailedError → 400 with reason', () => {
      handleDomainError(ctx, new RegistrationFailedError('verification failed'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.REGISTRATION_FAILED);
    });

    it('SessionNotFoundError → 401', () => {
      handleDomainError(ctx, new SessionNotFoundError(SESSION_ID), logger);
      expect(captured.status).toBe(401);
    });

    it('SessionExpiredError → 401', () => {
      handleDomainError(ctx, new SessionExpiredError(SESSION_ID), logger);
      expect(captured.status).toBe(401);
    });
  });

  // ===========================================================================
  describe('Swap errors', () => {
    it('SwapExpiredError → 400', () => {
      handleDomainError(ctx, new SwapExpiredError(SWAP_ID), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.swapId).toBe(SWAP_ID);
    });

    it('SwapAmountError → 400 with amount/min/max', () => {
      const amount = Amount.ofSatoshi(100n);
      const min = Amount.ofSatoshi(1_000n);
      const max = Amount.ofSatoshi(1_000_000n);
      handleDomainError(ctx, new SwapAmountError(amount, min, max), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.unit).toBe('sats');
    });

    it('SwapCreationError → 500', () => {
      handleDomainError(ctx, new SwapCreationError('LP unavailable'), logger);
      expect(captured.status).toBe(500);
    });

    it('InvalidSwapStateError → 400', () => {
      handleDomainError(ctx, new InvalidSwapStateError('expired', 'claim'), logger);
      expect(captured.status).toBe(400);
    });

    it('SwapOwnershipError → 403', () => {
      handleDomainError(ctx, new SwapOwnershipError(SWAP_ID), logger);
      expect(captured.status).toBe(403);
    });
  });

  // ===========================================================================
  describe('Payment errors', () => {
    it('PaymentParsingError → 400', () => {
      handleDomainError(ctx, new PaymentParsingError(new Error('bad uri')), logger);
      expect(captured.status).toBe(400);
    });

    it('InvalidPaymentAmountError → 400', () => {
      handleDomainError(ctx, new InvalidPaymentAmountError('lightning', 0n), logger);
      expect(captured.status).toBe(400);
    });

    it('SameAddressPaymentError → 400', () => {
      handleDomainError(ctx, new SameAddressPaymentError(), logger);
      expect(captured.status).toBe(400);
    });

    it('UnsupportedNetworkError without detected network → 400', () => {
      handleDomainError(ctx, new UnsupportedNetworkError('xyz'), logger);
      expect(captured.status).toBe(400);
    });

    it('UnsupportedNetworkError with detected network → 400 with arg', () => {
      handleDomainError(ctx, new UnsupportedNetworkError('xyz', 'ethereum'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.network).toBe('ethereum');
    });

    it('UnsupportedTokenError → 400 with token', () => {
      handleDomainError(ctx, new UnsupportedTokenError('0xtoken'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.token).toBe('0xtoken');
    });

    it('InvalidLightningInvoiceError → 400', () => {
      handleDomainError(ctx, new InvalidLightningInvoiceError('lnbc...'), logger);
      expect(captured.status).toBe(400);
    });

    it('LightningInvoiceExpiredError → 400', () => {
      handleDomainError(ctx, new LightningInvoiceExpiredError(), logger);
      expect(captured.status).toBe(400);
    });

    it('BitcoinAddressNetworkMismatchError → 400 with networks', () => {
      handleDomainError(ctx, new BitcoinAddressNetworkMismatchError('bc1...', 'mainnet', 'testnet'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.expectedNetwork).toBe('mainnet');
      expect(captured.body.error.args?.actualNetwork).toBe('testnet');
    });

    it('InvalidBitcoinAddressError → 400', () => {
      handleDomainError(ctx, new InvalidBitcoinAddressError('bad'), logger);
      expect(captured.status).toBe(400);
    });

    it('InvalidPaymentAddressError → 400', () => {
      handleDomainError(ctx, new InvalidPaymentAddressError('lightning', 'bad'), logger);
      expect(captured.status).toBe(400);
    });
  });

  // ===========================================================================
  describe('User errors', () => {
    it('UserSettingsNotFoundError → 404', () => {
      handleDomainError(ctx, new UserSettingsNotFoundError(ACCOUNT_ID), logger);
      expect(captured.status).toBe(404);
    });

    it('UnsupportedCurrencyError → 400 with currency', () => {
      handleDomainError(ctx, new UnsupportedCurrencyError('XYZ', ['USD','EUR']), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.currency).toBe('XYZ');
    });
  });

  // ===========================================================================
  describe('Balance errors', () => {
    it('plain InsufficientBalanceError → 400 (no amount)', () => {
      handleDomainError(ctx, new InsufficientBalanceError(undefined, undefined), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
    });

    it('InsufficientBalanceError with amount → 400 with formatted STRK amount', () => {
      const required = 4_140_000_000_000_000_000n; // 4.14 STRK
      handleDomainError(ctx, new InsufficientBalanceError(required, '0xtoken'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE_WITH_AMOUNT);
      expect(captured.body.error.args?.amount).toBe('4.14');
    });

    it('InsufficientBalanceError with security_deposit reason → INSUFFICIENT_BALANCE_SECURITY_DEPOSIT', () => {
      handleDomainError(
        ctx,
        new InsufficientBalanceError(4_140_000_000_000_000_000n, '0xtoken', 'security_deposit', 'STRK', 18),
        logger,
      );
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE_SECURITY_DEPOSIT);
      expect(captured.body.error.args?.amount).toBe('4.14');
      expect(captured.body.error.args?.token).toBe('STRK');
    });

    it('InsufficientBalanceError security_deposit without amount → generic message', () => {
      handleDomainError(
        ctx,
        new InsufficientBalanceError(undefined, '0xtoken', 'security_deposit'),
        logger,
      );
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE_SECURITY_DEPOSIT);
    });
  });

  // ===========================================================================
  // Workaround: esbuild may duplicate DomainError class identity, breaking
  // instanceof. The error handler falls back to duck-typing on errorCode.
  // These tests simulate the bundling issue by creating plain Error objects
  // decorated with errorCode/args — they are NOT instanceof DomainError.
  // ===========================================================================
  describe('Duck-typed domain errors (esbuild workaround)', () => {
    function fakeDomainError(
      errorCode: string,
      message: string,
      args?: Record<string, string | number>,
    ): Error {
      const err = new Error(message);
      Object.defineProperty(err, 'errorCode', {value: errorCode, enumerable: true});
      if (args !== undefined) {
        Object.defineProperty(err, 'args', {value: args, enumerable: true});
      }
      return err;
    }

    it('detects SwapAmountError by errorCode and returns 400 with args', () => {
      const error = fakeDomainError(
        ErrorCode.SWAP_AMOUNT_OUT_OF_RANGE,
        'Amount 0 sats is outside limits [1000, 2000000]',
        {amount: 0, min: 1000, max: 2_000_000, unit: 'sats'},
      );
      handleDomainError(ctx, error, logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.SWAP_AMOUNT_OUT_OF_RANGE);
      expect(captured.body.error.args?.min).toBe(1000);
      expect(captured.body.error.args?.max).toBe(2_000_000);
      expect(captured.body.error.args?.unit).toBe('sats');
    });

    it('detects ExternalServiceError by errorCode and returns 502', () => {
      const error = fakeDomainError(
        ErrorCode.EXTERNAL_SERVICE_ERROR,
        "External service 'Atomiq' failed: timeout",
        {service: 'Atomiq'},
      );
      handleDomainError(ctx, error, logger);
      expect(captured.status).toBe(502);
      expect(captured.body.error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(captured.body.error.args?.service).toBe('Atomiq');
    });

    it('detects error without args', () => {
      const error = fakeDomainError(
        ErrorCode.LIGHTNING_INVOICE_EXPIRED,
        'Lightning invoice has expired',
      );
      handleDomainError(ctx, error, logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe(ErrorCode.LIGHTNING_INVOICE_EXPIRED);
      expect(captured.body.error.args).toBeUndefined();
    });

    it('rejects non-Error objects', () => {
      handleDomainError(ctx, {errorCode: ErrorCode.FORBIDDEN, message: 'nope'}, logger);
      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('rejects Error without errorCode', () => {
      handleDomainError(ctx, new Error('plain error'), logger);
      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('rejects Error with unknown errorCode', () => {
      const error = fakeDomainError('NOT_A_REAL_CODE', 'bogus');
      handleDomainError(ctx, error, logger);
      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('rejects Error with args that is an array', () => {
      const error = new Error('bad args');
      Object.defineProperty(error, 'errorCode', {value: ErrorCode.FORBIDDEN, enumerable: true});
      Object.defineProperty(error, 'args', {value: ['not', 'an', 'object'], enumerable: true});
      handleDomainError(ctx, error, logger);
      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  // ===========================================================================
  describe('Shared errors', () => {
    it('ValidationError → 400 with field/reason', () => {
      handleDomainError(ctx, new ValidationError('amount', 'must be positive'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.field).toBe('amount');
    });

    it('UnauthorizedError → 401', () => {
      handleDomainError(ctx, new UnauthorizedError('no session'), logger);
      expect(captured.status).toBe(401);
    });

    it('InvalidStateTransitionError → 400 with from/to', () => {
      handleDomainError(ctx, new InvalidStateTransitionError('pending', 'deployed'), logger);
      expect(captured.status).toBe(400);
      expect(captured.body.error.args?.from).toBe('pending');
      expect(captured.body.error.args?.to).toBe('deployed');
    });

    it('PaymasterServiceError → 502 with reason', () => {
      handleDomainError(ctx, new PaymasterServiceError('avnu down'), logger);
      expect(captured.status).toBe(502);
    });

    it('UnsafeExternalCallError → 502 with service name', () => {
      handleDomainError(ctx, new UnsafeExternalCallError('avnu', 'malformed response'), logger);
      expect(captured.status).toBe(502);
      expect(captured.body.error.args?.service).toBe('avnu');
    });

    it('ExternalServiceError → 502 with service name', () => {
      handleDomainError(ctx, new ExternalServiceError('atomiq', 'timeout'), logger);
      expect(captured.status).toBe(502);
      expect(captured.body.error.args?.service).toBe('atomiq');
    });

    it('TimeoutError → 504 with operation', () => {
      handleDomainError(ctx, new TimeoutError('claim', 30_000), logger);
      expect(captured.status).toBe(504);
      expect(captured.body.error.args?.operation).toBe('claim');
    });
  });
});
