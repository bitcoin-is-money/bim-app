import { AccountId } from '../account/types';
import { type ChallengeData, ChallengeId, type ChallengePurpose } from './types';
/**
 * Challenge entity representing a WebAuthn challenge for registration or authentication.
 * Challenges are single-use and short-lived.
 */
export declare class Challenge {
    readonly id: ChallengeId;
    readonly challenge: string;
    readonly purpose: ChallengePurpose;
    readonly accountId: AccountId | undefined;
    readonly rpId: string | undefined;
    readonly origin: string | undefined;
    readonly expiresAt: Date;
    readonly createdAt: Date;
    private used;
    private constructor();
    /**
     * Creates a new challenge for registration.
     */
    static createForRegistration(params: {
        rpId: string;
        origin: string;
    }): Challenge;
    /**
     * Creates a new challenge for authentication.
     */
    static createForAuthentication(params: {
        accountId: AccountId;
        rpId: string;
        origin: string;
    }): Challenge;
    /**
     * Reconstitutes a challenge from persisted data.
     */
    static fromData(data: ChallengeData): Challenge;
    /**
     * Checks if the challenge has expired.
     */
    isExpired(): boolean;
    /**
     * Checks if the challenge has been used.
     */
    isUsed(): boolean;
    /**
     * Validates and marks the challenge as used.
     * Throws if the challenge is expired or already used.
     */
    consume(): void;
    /**
     * Validates the challenge without consuming it.
     */
    validate(): void;
    /**
     * Exports the challenge data for persistence.
     */
    toData(): ChallengeData;
}
//# sourceMappingURL=challenge.d.ts.map