import { Account } from '../account/account';
import { AccountId } from '../account/types';
import type { AccountRepository } from '../ports/account.repository';
import type { ChallengeRepository } from '../ports/challenge.repository';
import type { SessionRepository } from '../ports/session.repository';
import type { StarknetGateway } from '../ports/starknet.gateway';
import type { WebAuthnGateway } from '../ports/webauthn.gateway';
import { Session } from './session';
import { type WebAuthnRegistrationOptions } from './types';
export interface RegistrationUseCasesDeps {
    accountRepository: AccountRepository;
    challengeRepository: ChallengeRepository;
    sessionRepository: SessionRepository;
    webAuthnGateway: WebAuthnGateway;
    starknetGateway: StarknetGateway;
    idGenerator: () => AccountId;
}
export interface BeginRegistrationInput {
    username: string;
    rpId: string;
    rpName: string;
    origin: string;
}
export interface BeginRegistrationOutput {
    options: WebAuthnRegistrationOptions;
    challengeId: string;
}
export type BeginRegistrationUseCase = (input: BeginRegistrationInput) => Promise<BeginRegistrationOutput>;
/**
 * Initiates WebAuthn registration by creating a challenge.
 * Returns options to pass to navigator.credentials.create().
 */
export declare function getBeginRegistrationUseCase(deps: Pick<RegistrationUseCasesDeps, 'challengeRepository'>): BeginRegistrationUseCase;
export interface CompleteRegistrationInput {
    challengeId: string;
    username: string;
    credential: {
        id: string;
        rawId: string;
        response: {
            clientDataJSON: string;
            attestationObject: string;
        };
        type: 'public-key';
    };
}
export interface CompleteRegistrationOutput {
    account: Account;
    session: Session;
}
export type CompleteRegistrationUseCase = (input: CompleteRegistrationInput) => Promise<CompleteRegistrationOutput>;
/**
 * Completes WebAuthn registration after user interaction.
 * Verifies the credential, creates an account with its Starknet address, and starts a session.
 */
export declare function getCompleteRegistrationUseCase(deps: RegistrationUseCasesDeps): CompleteRegistrationUseCase;
//# sourceMappingURL=registration.usecases.d.ts.map