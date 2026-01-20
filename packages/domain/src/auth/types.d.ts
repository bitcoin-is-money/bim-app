import { AccountId } from '../account/types';
import { DomainError } from '../shared/errors';
/**
 * Unique identifier for a Session.
 */
export type SessionId = string & {
    readonly __brand: 'SessionId';
};
export declare namespace SessionId {
    function of(value: string): SessionId;
    function generate(): SessionId;
}
/**
 * Unique identifier for a WebAuthn Challenge.
 */
export type ChallengeId = string & {
    readonly __brand: 'ChallengeId';
};
export declare namespace ChallengeId {
    function of(value: string): ChallengeId;
    function generate(): ChallengeId;
}
export type ChallengePurpose = 'registration' | 'authentication';
export interface ChallengeData {
    id: ChallengeId;
    challenge: string;
    purpose: ChallengePurpose;
    accountId?: AccountId;
    rpId?: string;
    origin?: string;
    used: boolean;
    expiresAt: Date;
    createdAt: Date;
}
export interface SessionData {
    id: SessionId;
    accountId: AccountId;
    expiresAt: Date;
    createdAt: Date;
}
export interface WebAuthnRegistrationOptions {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    timeout?: number;
}
export interface WebAuthnAuthenticationOptions {
    challenge: string;
    rpId: string;
    allowCredentials?: Array<{
        id: string;
        type: 'public-key';
    }>;
    timeout?: number;
}
export interface WebAuthnRegistrationResponse {
    credentialId: string;
    publicKey: string;
    credentialPublicKey: string;
    signCount: number;
}
export interface WebAuthnAuthenticationResponse {
    credentialId: string;
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    signCount: number;
}
export declare class InvalidSessionIdError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class SessionNotFoundError extends DomainError {
    readonly sessionId: SessionId | string;
    constructor(sessionId: SessionId | string);
}
export declare class SessionExpiredError extends DomainError {
    readonly sessionId: SessionId;
    constructor(sessionId: SessionId);
}
export declare class ChallengeNotFoundError extends DomainError {
    readonly challengeId: ChallengeId | string;
    constructor(challengeId: ChallengeId | string);
}
export declare class ChallengeExpiredError extends DomainError {
    readonly challengeId: ChallengeId;
    constructor(challengeId: ChallengeId);
}
export declare class ChallengeAlreadyUsedError extends DomainError {
    readonly challengeId: ChallengeId;
    constructor(challengeId: ChallengeId);
}
export declare class AuthenticationFailedError extends DomainError {
    readonly reason: string;
    constructor(reason: string);
}
export declare class RegistrationFailedError extends DomainError {
    readonly reason: string;
    constructor(reason: string);
}
export declare const SESSION_DURATION_MS: number;
export declare const CHALLENGE_DURATION_MS: number;
//# sourceMappingURL=types.d.ts.map