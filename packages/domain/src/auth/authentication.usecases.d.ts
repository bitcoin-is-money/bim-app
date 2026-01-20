import { Account } from '../account/account';
import type { AccountRepository } from '../ports/account.repository';
import type { ChallengeRepository } from '../ports/challenge.repository';
import type { SessionRepository } from '../ports/session.repository';
import type { WebAuthnGateway } from '../ports/webauthn.gateway';
import { Session } from './session';
import { type WebAuthnAuthenticationOptions } from './types';
export interface AuthenticationUseCasesDeps {
    accountRepository: AccountRepository;
    challengeRepository: ChallengeRepository;
    sessionRepository: SessionRepository;
    webAuthnGateway: WebAuthnGateway;
}
export interface BeginAuthenticationInput {
    username: string;
    rpId: string;
    origin: string;
}
export interface BeginAuthenticationOutput {
    options: WebAuthnAuthenticationOptions;
    challengeId: string;
}
export type BeginAuthenticationUseCase = (input: BeginAuthenticationInput) => Promise<BeginAuthenticationOutput>;
/**
 * Initiates WebAuthn authentication for an existing user.
 * Returns options to pass to navigator.credentials.get().
 */
export declare function getBeginAuthenticationUseCase(deps: Pick<AuthenticationUseCasesDeps, 'accountRepository' | 'challengeRepository'>): BeginAuthenticationUseCase;
export interface CompleteAuthenticationInput {
    challengeId: string;
    credential: {
        id: string;
        rawId: string;
        response: {
            clientDataJSON: string;
            authenticatorData: string;
            signature: string;
            userHandle?: string;
        };
        type: 'public-key';
    };
}
export interface CompleteAuthenticationOutput {
    account: Account;
    session: Session;
}
export type CompleteAuthenticationUseCase = (input: CompleteAuthenticationInput) => Promise<CompleteAuthenticationOutput>;
/**
 * Completes WebAuthn authentication after user interaction.
 * Verifies the signature, updates sign counter, and creates a session.
 */
export declare function getCompleteAuthenticationUseCase(deps: AuthenticationUseCasesDeps): CompleteAuthenticationUseCase;
//# sourceMappingURL=authentication.usecases.d.ts.map