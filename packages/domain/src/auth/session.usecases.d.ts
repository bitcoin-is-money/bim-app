import { Account } from '../account/account';
import type { AccountRepository } from '../ports/account.repository';
import type { SessionRepository } from '../ports/session.repository';
import { Session } from './session';
export interface SessionUseCasesDeps {
    sessionRepository: SessionRepository;
    accountRepository: AccountRepository;
}
export interface ValidateSessionInput {
    sessionId: string;
}
export interface ValidateSessionOutput {
    session: Session;
    account: Account;
}
/**
 * Validates an active session and returns the associated account.
 * Use this for protected routes to verify user authentication.
 */
export declare function validateSession(deps: SessionUseCasesDeps): (input: ValidateSessionInput) => Promise<ValidateSessionOutput>;
export interface LogoutInput {
    sessionId: string;
}
/**
 * Invalidates a session (logout).
 */
export declare function logout(deps: Pick<SessionUseCasesDeps, 'sessionRepository'>): (input: LogoutInput) => Promise<void>;
//# sourceMappingURL=session.usecases.d.ts.map