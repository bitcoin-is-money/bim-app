import {generateChallenge, isoBase64URL} from '@simplewebauthn/server/helpers';
import {describe, beforeEach, it, expect} from 'vitest';
import {SimpleWebAuthnGateway} from '../../../../src/adapters/gateways/simplewebauthn.gateway.js';
import {VirtualAuthenticator} from './virtual-authenticator.js';

/**
 * Tests that VirtualAuthenticator produces credentials that can be verified
 * by the real SimpleWebAuthnGateway.
 */
describe('VirtualAuthenticator', () => {
  let authenticator: VirtualAuthenticator;
  let gateway: SimpleWebAuthnGateway;

  const rpId = 'localhost';
  const rpName = 'Test App';
  // Use https:// origin to match VirtualAuthenticator's default behavior
  const origin = 'https://localhost';

  beforeEach(() => {
    authenticator = new VirtualAuthenticator();
    gateway = new SimpleWebAuthnGateway();
  });

  describe('createCredential', () => {
    it('creates a valid credential that passes verification', async () => {
      // Generate a challenge
      const challenge = await generateChallenge();
      const challengeBase64 = isoBase64URL.fromBuffer(challenge);

      // Create credential using virtual authenticator
      const credential = await authenticator.createCredential({
        challenge: challengeBase64,
        rp: {id: rpId, name: rpName},
        user: {
          id: isoBase64URL.fromBuffer(Buffer.from('user123')),
          name: 'testuser',
          displayName: 'Test User',
        },
      });

      // Verify with the real gateway
      const result = await gateway.verifyRegistration({
        expectedChallenge: challengeBase64,
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential: credential,
      });

      expect(result.verified).toBe(true);
      expect(result.encodedCredentialId).toBe(credential.id);
      expect(result.starknetPublicKeyX).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.encodedCredentialPublicKey).toBeTruthy();
      expect(result.signCount).toBe(0);
    });

    it('stores the credential for later authentication', async () => {
      const challenge = await generateChallenge();

      await authenticator.createCredential({
        challenge: isoBase64URL.fromBuffer(challenge),
        rp: {id: rpId, name: rpName},
        user: {
          id: isoBase64URL.fromBuffer(Buffer.from('user456')),
          name: 'anotheruser',
          displayName: 'Another User',
        },
      });

      const credentials = authenticator.getStoredCredentials();
      expect(credentials).toHaveLength(1);
      expect(credentials[0].rpId).toBe(rpId);
    });
  });

  describe('getAssertion', () => {
    it('creates a valid assertion that passes verification', async () => {
      // First, register a credential
      const regChallenge = await generateChallenge();
      const regChallengeBase64 = isoBase64URL.fromBuffer(regChallenge);

      const regCredential = await authenticator.createCredential({
        challenge: regChallengeBase64,
        rp: {id: rpId, name: rpName},
        user: {
          id: isoBase64URL.fromBuffer(Buffer.from('authuser')),
          name: 'authuser',
          displayName: 'Auth User',
        },
      });

      // Verify registration to get the credential public key
      const regResult = await gateway.verifyRegistration({
        expectedChallenge: regChallengeBase64,
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential: regCredential,
      });

      expect(regResult.verified).toBe(true);

      // Now authenticate
      const authChallenge = await generateChallenge();
      const authChallengeBase64 = isoBase64URL.fromBuffer(authChallenge);

      const assertion = await authenticator.getAssertion({
        challenge: authChallengeBase64,
        rpId: rpId,
        allowCredentials: [{id: regCredential.id, type: 'public-key'}],
      });

      // Verify with the real gateway
      const authResult = await gateway.verifyAuthentication({
        expectedChallenge: authChallengeBase64,
        expectedOrigin: origin,
        expectedRPID: rpId,
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

    it('increments sign count on each authentication', async () => {
      // Register
      const regChallenge = await generateChallenge();
      const credential = await authenticator.createCredential({
        challenge: isoBase64URL.fromBuffer(regChallenge),
        rp: {id: rpId, name: rpName},
        user: {
          id: isoBase64URL.fromBuffer(Buffer.from('counter-user')),
          name: 'counter-user',
          displayName: 'Counter User',
        },
      });

      // Verify registration
      const regResult = await gateway.verifyRegistration({
        expectedChallenge: isoBase64URL.fromBuffer(regChallenge),
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential,
      });

      // Authenticate multiple times
      let lastSignCount = regResult.signCount;

      for (let i = 1; i <= 3; i++) {
        const authChallenge = await generateChallenge();
        const assertion = await authenticator.getAssertion({
          challenge: isoBase64URL.fromBuffer(authChallenge),
          rpId,
        });

        const authResult = await gateway.verifyAuthentication({
          expectedChallenge: isoBase64URL.fromBuffer(authChallenge),
          expectedOrigin: origin,
          expectedRPID: rpId,
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

    it('throws error if no credential found for rpId', async () => {
      await expect(
        authenticator.getAssertion({
          challenge: isoBase64URL.fromBuffer(await generateChallenge()),
          rpId: 'unknown.example.com',
        }),
      ).rejects.toThrow('No credential found for rpId');
    });
  });

  describe('clear', () => {
    it('removes all stored credentials', async () => {
      // Create a credential
      await authenticator.createCredential({
        challenge: isoBase64URL.fromBuffer(await generateChallenge()),
        rp: {id: rpId, name: rpName},
        user: {
          id: isoBase64URL.fromBuffer(Buffer.from('clearuser')),
          name: 'clearuser',
          displayName: 'Clear User',
        },
      });

      expect(authenticator.getStoredCredentials()).toHaveLength(1);

      authenticator.clear();

      expect(authenticator.getStoredCredentials()).toHaveLength(0);
    });
  });
});
