import {WebauthnUserHandleDecoder} from '@bim/lib/auth';
import type {Logger} from 'pino';
import {AccountId, AccountNotFoundError} from '../../account';
import type {
  AccountRepository,
  SessionRepository,
  TransactionManager,
  WebAuthnGateway,
} from '../../ports';
import {ChallengeId} from '../challenge';
import {AuthenticationFailedError, InvalidChallengeError} from '../errors';
import {Session} from '../session';
import type {SessionConfig} from '../session.config';
import type {
  CompleteLoginInput,
  CompleteLoginOutput,
  CompleteLoginUseCase,
} from '../use-cases/complete-login.use-case';
import type {ChallengeConsumer} from './challenge-consumer.service';

export interface CompleteLoginDeps {
  accountRepository: AccountRepository;
  sessionRepository: SessionRepository;
  transactionManager: TransactionManager;
  webAuthnGateway: WebAuthnGateway;
  challengeConsumer: ChallengeConsumer;
  sessionConfig: SessionConfig;
  logger: Logger;
}

/**
 * Completes WebAuthn authentication after user interaction.
 * Verifies the signature, updates sign counter, and creates a session.
 *
 * @throws ChallengeNotFoundError | ChallengeExpiredError | ChallengeAlreadyUsedError
 *         via ChallengeConsumer when the challenge can't be consumed
 * @throws InvalidChallengeError on purpose / RP mismatch
 * @throws AuthenticationFailedError on missing userHandle or verification failure
 * @throws AccountNotFoundError if the account doesn't exist
 */
export class CompleteLogin implements CompleteLoginUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: CompleteLoginDeps) {
    this.log = deps.logger.child({name: 'complete-login.service.ts'});
  }

  async execute(input: CompleteLoginInput): Promise<CompleteLoginOutput> {
    // Atomically consume the challenge (prevents TOCTOU race condition)
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await this.deps.challengeConsumer.consume(challengeId);

    // Verify challenge purpose
    if (challenge.purpose !== 'authentication') {
      throw new InvalidChallengeError(challengeId, 'challenge is not for authentication');
    }

    // Username-less flow: decode userHandle to get AccountId
    const userHandle = input.credential.response.userHandle;
    if (!userHandle) {
      throw new AuthenticationFailedError('No userHandle in credential response');
    }
    const uuid = WebauthnUserHandleDecoder.decodeToUuid(userHandle);
    const accountId = AccountId.of(uuid);
    const account = await this.deps.accountRepository.findById(accountId);

    if (!account) {
      throw new AccountNotFoundError('Account not found');
    }

    // Validate challenge has required WebAuthn fields
    if (!challenge.origin || !challenge.rpId) {
      throw new InvalidChallengeError(challengeId, 'missing origin or rpId');
    }

    // Verify WebAuthn signature
    const verification = await this.deps.webAuthnGateway.verifyAuthentication({
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      credential: input.credential,
      storedCredential: {
        credentialId: account.credentialId,
        publicKey: account.publicKey,
        credentialPublicKey: account.credentialPublicKey,
        signCount: account.getSignCount(),
      },
    });

    if (!verification.verified) {
      throw new AuthenticationFailedError('WebAuthn verification failed');
    }

    // Update sign counter (replay protection)
    if (verification.newSignCount > account.getSignCount()) {
      account.updateSignCount(verification.newSignCount);
    }

    const session = Session.create(account.id, this.deps.sessionConfig.durationMs);

    // Persist atomically (challenge already consumed atomically above).
    // Delete any prior sessions so only the latest login is valid (single-session).
    await this.deps.transactionManager.execute(async () => {
      await this.deps.accountRepository.save(account);
      await this.deps.sessionRepository.deleteByAccountId(account.id);
      await this.deps.sessionRepository.save(session);
    });

    this.log.info({accountId: account.id}, 'Authentication completed');
    return {account, session};
  }
}
