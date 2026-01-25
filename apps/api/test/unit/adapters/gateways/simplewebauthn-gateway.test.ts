import {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth/webauthn-virtual-authenticator';
import {P256Signer} from '@bim/test-toolkit/crypto/p256-signer';
import {isoBase64URL} from '@simplewebauthn/server/helpers';
import {beforeEach, describe, expect, it} from 'vitest';
import {SimpleWebAuthnGateway} from "../../../../src/adapters";

/**
 * Tests for SimpleWebAuthnGateway using WebauthnVirtualAuthenticator.
 *
 * These tests verify that the gateway correctly:
 * - Verifies WebAuthn registration and authentication responses
 * - Maps responses to domain types
 * - Extracts Starknet-compatible public key
 * - Handles errors gracefully (returns verified: false instead of throwing)
 */
describe('SimpleWebAuthnGateway', () => {
  const RP_ID = 'localhost';
  const RP_NAME = 'Test App';
  const ORIGIN = `https://${RP_ID}`;

  let gateway: SimpleWebAuthnGateway;
  let authenticator: WebauthnVirtualAuthenticator;

  beforeEach(() => {
    gateway = new SimpleWebAuthnGateway();
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

  describe('verifyRegistration', () => {
    it('returns verified: true for valid registration', async () => {
      const challenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const result = await gateway.verifyRegistration({
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      expect(result.verified).toBe(true);
      expect(result.encodedCredentialId).toBe(credential.id);
      expect(result.signCount).toBe(0);
    });

    it('extracts Starknet-compatible public key X coordinate', async () => {
      const signer = P256Signer.generate();
      const authWithSigner = new WebauthnVirtualAuthenticator({signer});

      const challenge = generateChallenge();
      const credential = await authWithSigner.createCredential({
        challenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const result = await gateway.verifyRegistration({
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      expect(result.verified).toBe(true);
      // starknetPublicKeyX should be a 0x-prefixed hex string
      expect(result.starknetPublicKeyX).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('returns base64url-encoded credential public key', async () => {
      const challenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const result = await gateway.verifyRegistration({
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      expect(result.verified).toBe(true);
      // encodedCredentialPublicKey should be a valid base64url string
      expect(result.encodedCredentialPublicKey).toBeTruthy();
      // Should be decodable without error
      expect(() => isoBase64URL.toBuffer(result.encodedCredentialPublicKey)).not.toThrow();
    });

    it('returns verified: false for mismatched challenge', async () => {
      const credential = await authenticator.createCredential({
        challenge: generateChallenge(),
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const result = await gateway.verifyRegistration({
        expectedChallenge: generateChallenge(), // Different challenge
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      expect(result.verified).toBe(false);
      expect(result.encodedCredentialId).toBe('');
    });

    it('returns verified: false for mismatched origin', async () => {
      const challenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const result = await gateway.verifyRegistration({
        expectedChallenge: challenge,
        expectedOrigin: 'https://evil.com',
        expectedRPID: RP_ID,
        credential,
      });

      expect(result.verified).toBe(false);
    });

    it('returns verified: false for mismatched RP ID', async () => {
      const challenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const result = await gateway.verifyRegistration({
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: 'different-rp.com',
        credential,
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('verifyAuthentication', () => {
    it('returns verified: true for valid authentication', async () => {
      // Register first
      const regChallenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const regResult = await gateway.verifyRegistration({
        expectedChallenge: regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      expect(regResult.verified).toBe(true);

      // Authenticate
      const authChallenge = generateChallenge();
      const assertion = await authenticator.getAssertion({
        challenge: authChallenge,
        rpId: RP_ID,
      });

      const authResult = await gateway.verifyAuthentication({
        expectedChallenge: authChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: assertion,
        storedCredential: {
          credentialId: regResult.encodedCredentialId,
          publicKey: regResult.starknetPublicKeyX,
          credentialPublicKey: regResult.encodedCredentialPublicKey,
          signCount: regResult.signCount,
        },
      });

      expect(authResult.verified).toBe(true);
      expect(authResult.newSignCount).toBe(1);
    });

    it('increments sign count correctly', async () => {
      // Register
      const regChallenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const regResult = await gateway.verifyRegistration({
        expectedChallenge: regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      let lastSignCount = regResult.signCount;

      // Authenticate multiple times
      for (let i = 1; i <= 3; i++) {
        const authChallenge = generateChallenge();
        const assertion = await authenticator.getAssertion({
          challenge: authChallenge,
          rpId: RP_ID,
        });

        const authResult = await gateway.verifyAuthentication({
          expectedChallenge: authChallenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          credential: assertion,
          storedCredential: {
            credentialId: regResult.encodedCredentialId,
            publicKey: regResult.starknetPublicKeyX,
            credentialPublicKey: regResult.encodedCredentialPublicKey,
            signCount: lastSignCount,
          },
        });

        expect(authResult.verified).toBe(true);
        expect(authResult.newSignCount).toBe(i);
        lastSignCount = authResult.newSignCount;
      }
    });

    it('returns verified: false for mismatched challenge', async () => {
      // Register
      const regChallenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const regResult = await gateway.verifyRegistration({
        expectedChallenge: regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      // Authenticate with wrong challenge
      const assertion = await authenticator.getAssertion({
        challenge: generateChallenge(),
        rpId: RP_ID,
      });

      const authResult = await gateway.verifyAuthentication({
        expectedChallenge: generateChallenge(), // Different challenge
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: assertion,
        storedCredential: {
          credentialId: regResult.encodedCredentialId,
          publicKey: regResult.starknetPublicKeyX,
          credentialPublicKey: regResult.encodedCredentialPublicKey,
          signCount: regResult.signCount,
        },
      });

      expect(authResult.verified).toBe(false);
    });

    it('returns verified: false for mismatched origin', async () => {
      // Register
      const regChallenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const regResult = await gateway.verifyRegistration({
        expectedChallenge: regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      // Authenticate
      const authChallenge = generateChallenge();
      const assertion = await authenticator.getAssertion({
        challenge: authChallenge,
        rpId: RP_ID,
      });

      const authResult = await gateway.verifyAuthentication({
        expectedChallenge: authChallenge,
        expectedOrigin: 'https://evil.com',
        expectedRPID: RP_ID,
        credential: assertion,
        storedCredential: {
          credentialId: regResult.encodedCredentialId,
          publicKey: regResult.starknetPublicKeyX,
          credentialPublicKey: regResult.encodedCredentialPublicKey,
          signCount: regResult.signCount,
        },
      });

      expect(authResult.verified).toBe(false);
    });

    it('returns verified: false when sign count is replayed', async () => {
      // Register
      const regChallenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const regResult = await gateway.verifyRegistration({
        expectedChallenge: regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      // First authentication (succeeds)
      const authChallenge1 = generateChallenge();
      const assertion1 = await authenticator.getAssertion({
        challenge: authChallenge1,
        rpId: RP_ID,
      });

      const authResult1 = await gateway.verifyAuthentication({
        expectedChallenge: authChallenge1,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: assertion1,
        storedCredential: {
          credentialId: regResult.encodedCredentialId,
          publicKey: regResult.starknetPublicKeyX,
          credentialPublicKey: regResult.encodedCredentialPublicKey,
          signCount: regResult.signCount,
        },
      });

      expect(authResult1.verified).toBe(true);

      // Second authentication with inflated stored sign count (simulates replay detection)
      const authChallenge2 = generateChallenge();
      const assertion2 = await authenticator.getAssertion({
        challenge: authChallenge2,
        rpId: RP_ID,
      });

      const authResult2 = await gateway.verifyAuthentication({
        expectedChallenge: authChallenge2,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: assertion2,
        storedCredential: {
          credentialId: regResult.encodedCredentialId,
          publicKey: regResult.starknetPublicKeyX,
          credentialPublicKey: regResult.encodedCredentialPublicKey,
          signCount: 9999, // Much higher than authenticator's counter
        },
      });

      expect(authResult2.verified).toBe(false);
    });

    it('returns verified: false when credentialPublicKey is missing', async () => {
      // Register
      const regChallenge = generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: regChallenge,
        rp: {id: RP_ID, name: RP_NAME},
        user: {id: generateUserId(), name: 'testUser', displayName: 'Test User'},
      });

      const regResult = await gateway.verifyRegistration({
        expectedChallenge: regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
      });

      // Authenticate without credentialPublicKey
      const authChallenge = generateChallenge();
      const assertion = await authenticator.getAssertion({
        challenge: authChallenge,
        rpId: RP_ID,
      });

      const authResult = await gateway.verifyAuthentication({
        expectedChallenge: authChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: assertion,
        storedCredential: {
          credentialId: regResult.encodedCredentialId,
          publicKey: regResult.starknetPublicKeyX,
          credentialPublicKey: '', // Empty/missing
          signCount: regResult.signCount,
        },
      });

      expect(authResult.verified).toBe(false);
    });
  });
});
