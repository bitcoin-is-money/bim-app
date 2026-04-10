import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import {P256Signer} from '@bim/test-toolkit/crypto';
import {verifyAuthenticationResponse, verifyRegistrationResponse,} from '@simplewebauthn/server';
import {isoBase64URL} from '@simplewebauthn/server/helpers';
import {beforeEach, describe, expect, it} from 'vitest';

/**
 * Unit tests for WebauthnVirtualAuthenticator.
 *
 * These tests verify that the virtual authenticator produces valid WebAuthn
 * credentials by using @simplewebauthn/server's verification functions directly.
 */
describe('WebauthnVirtualAuthenticator', () => {
  const RP_ID = 'localhost';
  const RP_NAME = 'Test App';
  const ORIGIN = `https://${RP_ID}`;

  let authenticator: WebauthnVirtualAuthenticator;

  beforeEach(() => {
    authenticator = new WebauthnVirtualAuthenticator();
  });

  function generateChallenge(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return isoBase64URL.fromBuffer(bytes);
  }

  function generateUserId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return isoBase64URL.fromBuffer(bytes);
  }

  describe('createCredential', () => {
    it('creates a credential with valid structure', async () => {
      const challenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      expect(credential.type).toBe('public-key');
      expect(credential.id).toBeTruthy();
      expect(credential.rawId).toBe(credential.id);
      expect(credential.response.clientDataJSON).toBeTruthy();
      expect(credential.response.attestationObject).toBeTruthy();
    });

    it('produces a credential that passes WebAuthn verification', async () => {
      const challenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      const result = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });

      expect(result.verified).toBe(true);
      expect(result.registrationInfo).toBeDefined();
      expect(result.registrationInfo?.credential.id).toBeTruthy();
      expect(result.registrationInfo?.credential.publicKey).toBeInstanceOf(Uint8Array);
    });

    it('stores the credential for later authentication', async () => {
      const credential = await authenticator.createCredential({
        challenge: generateChallenge(),
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      const stored = authenticator.getCredential(credential.id);
      expect(stored).toBeDefined();
      expect(stored?.rpId).toBe(RP_ID);
    });

    it('uses custom origin when provided', async () => {
      const customOrigin = 'https://custom.example.com';
      const challenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
        origin: customOrigin,
      });

      const result = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: customOrigin,
        expectedRPID: RP_ID,
      });

      expect(result.verified).toBe(true);
    });

    it('uses deterministic signer when provided', async () => {
      const signer = P256Signer.generate();
      const authWithSigner = new WebauthnVirtualAuthenticator({signer});

      const credential = await authWithSigner.createCredential({
        challenge: generateChallenge(),
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      const stored = authWithSigner.getCredential(credential.id);
      expect(stored?.signer.getPublicKeyX()).toBe(signer.getPublicKeyX());
    });
  });

  describe('getAssertion', () => {
    it('creates a valid assertion that passes WebAuthn verification', async () => {
      // First, register a credential
      const regChallenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      const regResult = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });

      expect(regResult.verified).toBe(true);

      // Now, authenticate with the credential
      const authChallenge = generateChallenge();
      const assertion = await authenticator.getAssertion({
        challenge: authChallenge,
        rpId: RP_ID,
        allowCredentials: [{id: credential.id, type: 'public-key'}],
      });

      const authResult = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: authChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: regResult.registrationInfo!.credential.id,
          publicKey: regResult.registrationInfo!.credential.publicKey,
          counter: regResult.registrationInfo!.credential.counter,
        },
      });

      expect(authResult.verified).toBe(true);
      expect(authResult.authenticationInfo.newCounter).toBe(1);
    });

    it('increments sign count on each authentication', async () => {
      const regChallenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      const regResult = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });

      let lastCounter = regResult.registrationInfo!.credential.counter;

      // Perform multiple authentications
      for (let i = 1; i <= 3; i++) {
        const authChallenge = generateChallenge();
        const assertion = await authenticator.getAssertion({
          challenge: authChallenge,
          rpId: RP_ID,
        });

        const authResult = await verifyAuthenticationResponse({
          response: assertion,
          expectedChallenge: authChallenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          credential: {
            id: regResult.registrationInfo!.credential.id,
            publicKey: regResult.registrationInfo!.credential.publicKey,
            counter: lastCounter,
          },
        });

        expect(authResult.verified).toBe(true);
        expect(authResult.authenticationInfo.newCounter).toBe(i);
        lastCounter = authResult.authenticationInfo.newCounter;
      }
    });

    it('finds credential without allowCredentials if rpId matches', async () => {
      const credential = await authenticator.createCredential({
        challenge: generateChallenge(),
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      const assertion = await authenticator.getAssertion({
        challenge: generateChallenge(),
        rpId: RP_ID,
        // No allowCredentials specified
      });

      expect(assertion.id).toBe(credential.id);
    });

    it('throws error if no credential found for rpId', async () => {
      await authenticator.createCredential({
        challenge: generateChallenge(),
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      await expect(
        authenticator.getAssertion({
          challenge: generateChallenge(),
          rpId: 'different-rp.com',
        }),
      ).rejects.toThrow('No credential found for rpId: different-rp.com');
    });

    it('uses custom origin when provided', async () => {
      const customOrigin = 'https://custom.example.com';
      const regChallenge = generateChallenge();

      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
        origin: customOrigin,
      });

      const regResult = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: regChallenge,
        expectedOrigin: customOrigin,
        expectedRPID: RP_ID,
      });

      const authChallenge = generateChallenge();
      const assertion = await authenticator.getAssertion({
        challenge: authChallenge,
        rpId: RP_ID,
        origin: customOrigin,
      });

      const authResult = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: authChallenge,
        expectedOrigin: customOrigin,
        expectedRPID: RP_ID,
        credential: {
          id: regResult.registrationInfo!.credential.id,
          publicKey: regResult.registrationInfo!.credential.publicKey,
          counter: 0,
        },
      });

      expect(authResult.verified).toBe(true);
    });
  });

  describe('credential management', () => {
    it('getStoredCredentials returns all credentials', async () => {
      await authenticator.createCredential({
        challenge: generateChallenge(),
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'user1', displayName: 'User 1'},
      });

      await authenticator.createCredential({
        challenge: generateChallenge(),
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'user2', displayName: 'User 2'},
      });

      const credentials = authenticator.getStoredCredentials();
      expect(credentials).toHaveLength(2);
    });

    it('getCredential returns undefined for unknown ID', () => {
      const credential = authenticator.getCredential('unknown-id');
      expect(credential).toBeUndefined();
    });

    it('clear removes all stored credentials', async () => {
      await authenticator.createCredential({
        challenge: generateChallenge(),
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
      });

      expect(authenticator.getStoredCredentials()).toHaveLength(1);

      authenticator.clear();

      expect(authenticator.getStoredCredentials()).toHaveLength(0);
    });
  });

  describe('verification failures', () => {
    describe('registration', () => {
      it('fails when challenge does not match', async () => {
        const credential = await authenticator.createCredential({
          challenge: generateChallenge(),
          rp: {id: RP_ID, name: RP_NAME},
          user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
        });

        await expect(
          verifyRegistrationResponse({
            response: credential,
            expectedChallenge: generateChallenge(), // Different challenge
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
          }),
        ).rejects.toThrow();
      });

      it('fails when origin does not match', async () => {
        const challenge = generateChallenge();
        const credential = await authenticator.createCredential({
          challenge,
          rp: {id: RP_ID, name: RP_NAME},
          user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
        });

        await expect(
          verifyRegistrationResponse({
            response: credential,
            expectedChallenge: challenge,
            expectedOrigin: 'https://evil.com',
            expectedRPID: RP_ID,
          }),
        ).rejects.toThrow();
      });

      it('fails when RP ID does not match', async () => {
        const challenge = generateChallenge();
        const credential = await authenticator.createCredential({
          challenge,
          rp: {id: RP_ID, name: RP_NAME},
          user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
        });

        await expect(
          verifyRegistrationResponse({
            response: credential,
            expectedChallenge: challenge,
            expectedOrigin: ORIGIN,
            expectedRPID: 'different-rp.com',
          }),
        ).rejects.toThrow();
      });
    });

    describe('authentication', () => {
      it('fails when challenge does not match', async () => {
        const regChallenge = generateChallenge();
        const credential = await authenticator.createCredential({
          challenge: regChallenge,
          rp: {id: RP_ID, name: RP_NAME},
          user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
        });

        const regResult = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: regChallenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
        });

        const assertion = await authenticator.getAssertion({
          challenge: generateChallenge(),
          rpId: RP_ID,
        });

        await expect(
          verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge: generateChallenge(), // Different challenge
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            credential: {
              id: regResult.registrationInfo!.credential.id,
              publicKey: regResult.registrationInfo!.credential.publicKey,
              counter: 0,
            },
          }),
        ).rejects.toThrow();
      });

      it('fails when origin does not match', async () => {
        const regChallenge = generateChallenge();
        const credential = await authenticator.createCredential({
          challenge: regChallenge,
          rp: {id: RP_ID, name: RP_NAME},
          user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
        });

        const regResult = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: regChallenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
        });

        const authChallenge = generateChallenge();
        const assertion = await authenticator.getAssertion({
          challenge: authChallenge,
          rpId: RP_ID,
        });

        await expect(
          verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge: authChallenge,
            expectedOrigin: 'https://evil.com',
            expectedRPID: RP_ID,
            credential: {
              id: regResult.registrationInfo!.credential.id,
              publicKey: regResult.registrationInfo!.credential.publicKey,
              counter: 0,
            },
          }),
        ).rejects.toThrow();
      });

      it('fails when sign count is not greater than stored', async () => {
        const regChallenge = generateChallenge();
        const credential = await authenticator.createCredential({
          challenge: regChallenge,
          rp: {id: RP_ID, name: RP_NAME},
          user: {id: generateUserId(), name: 'testuser', displayName: 'Test User'},
        });

        const regResult = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: regChallenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
        });

        const authChallenge = generateChallenge();
        const assertion = await authenticator.getAssertion({
          challenge: authChallenge,
          rpId: RP_ID,
        });

        // Use a stored counter higher than what the authenticator will produce
        await expect(
          verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge: authChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            credential: {
              id: regResult.registrationInfo!.credential.id,
              publicKey: regResult.registrationInfo!.credential.publicKey,
              counter: 9999, // Much higher than authenticator's counter
            },
          }),
        ).rejects.toThrow();
      });
    });
  });
});
