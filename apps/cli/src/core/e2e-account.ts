import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {E2eAccountSecrets} from '../config/secrets.js';

export type AccountKey = 'accountA' | 'accountB';

/**
 * Represents a persistent E2E test account.
 * Owns the WebAuthn virtual authenticator (with mutable signCount).
 * Serializable for persistence across test runs via .secrets.json.
 */
export class E2eAccount {
  readonly username: string;
  readonly starknetAddress: string;
  readonly authenticator: WebauthnVirtualAuthenticator;
  readonly accountKey: AccountKey;

  private constructor(
    username: string,
    starknetAddress: string,
    authenticator: WebauthnVirtualAuthenticator,
    accountKey: AccountKey,
  ) {
    this.username = username;
    this.starknetAddress = starknetAddress;
    this.authenticator = authenticator;
    this.accountKey = accountKey;
  }

  static fromSecrets(
    data: E2eAccountSecrets,
    accountKey: AccountKey,
  ): E2eAccount {
    const authenticator = WebauthnVirtualAuthenticator.deserialize(data.authenticator);
    return new E2eAccount(data.username, data.starknetAddress, authenticator, accountKey);
  }

  serialize(): E2eAccountSecrets {
    return {
      username: this.username,
      starknetAddress: this.starknetAddress,
      authenticator: this.authenticator.serialize(),
    };
  }
}
