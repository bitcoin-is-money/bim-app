import type {
  AuthenticationVerificationResult,
  RegistrationVerificationResult,
  VerifyAuthenticationParams,
  VerifyRegistrationParams,
  WebAuthnGateway,
} from '@bim/domain';
import {type Uint8Array_, verifyAuthenticationResponse, verifyRegistrationResponse,} from '@simplewebauthn/server';
import {cose, decodeCredentialPublicKey,} from '@simplewebauthn/server/helpers';

/**
 * Stark curve prime: 2^251 + 17 * 2^192 + 1
 * Values used in Starknet Pedersen hash must be < this prime.
 */
const STARK_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

/**
 * SimpleWebAuthn-based implementation of WebAuthnGateway.
 */
export class SimpleWebAuthnGateway implements WebAuthnGateway {
  async verifyRegistration(
    params: VerifyRegistrationParams,
  ): Promise<RegistrationVerificationResult> {
    try {
      const verification = await verifyRegistrationResponse({
        response: {
          id: params.credential.id,
          rawId: params.credential.rawId,
          response: {
            clientDataJSON: params.credential.response.clientDataJSON,
            attestationObject: params.credential.response.attestationObject,
          },
          type: params.credential.type,
          clientExtensionResults: {},
          authenticatorAttachment: 'platform',
        },
        expectedChallenge: params.expectedChallenge,
        expectedOrigin: params.expectedOrigin,
        expectedRPID: params.expectedRPID,
        requireUserVerification: true,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return {
          verified: false,
          encodedCredentialId: '',
          starknetPublicKeyX: '',
          encodedCredentialPublicKey: '',
          signCount: 0,
        };
      }

      const { registrationInfo } = verification;

      // Extract the public key in a format we can use
      const encodedCredentialPublicKey: Base64URLString = Buffer.from(
        registrationInfo.credential.publicKey,
      ).toString('base64url');

      // Extract the credential ID
      // In SimpleWebAuthn v13+, credential.id is already a base64url string
      const credId = registrationInfo.credential.id;
      const encodedCredentialId: Base64URLString = credId instanceof Uint8Array
        ? Buffer.from(credId).toString('base64url')
        : String(credId);

      // For Starknet compatibility, we need to extract the x-coordinate
      // This assumes P-256 (secp256r1) curve used by WebAuthn
      const starknetPublicKeyX = this.extractP256XCoordinate(registrationInfo.credential.publicKey);

      return {
        verified: true,
        encodedCredentialId: encodedCredentialId,
        starknetPublicKeyX: starknetPublicKeyX,
        encodedCredentialPublicKey: encodedCredentialPublicKey,
        signCount: registrationInfo.credential.counter,
      };
    } catch (error) {
      console.error('WebAuthn registration verification failed:', error);
      return {
        verified: false,
        encodedCredentialId: '',
        starknetPublicKeyX: '',
        encodedCredentialPublicKey: '',
        signCount: 0,
      };
    }
  }

  async verifyAuthentication(
    params: VerifyAuthenticationParams,
  ): Promise<AuthenticationVerificationResult> {
    try {
      // Decode the stored credential public key
      const credentialPublicKey = params.storedCredential.credentialPublicKey
        ? Buffer.from(params.storedCredential.credentialPublicKey, 'base64url')
        : undefined;

      if (!credentialPublicKey) {
        return {
          verified: false,
          newSignCount: 0,
        };
      }

      const verification = await verifyAuthenticationResponse({
        response: {
          id: params.credential.id,
          rawId: params.credential.rawId,
          response: {
            clientDataJSON: params.credential.response.clientDataJSON,
            authenticatorData: params.credential.response.authenticatorData,
            signature: params.credential.response.signature,
            userHandle: params.credential.response.userHandle,
          },
          type: params.credential.type,
          clientExtensionResults: {},
          authenticatorAttachment: 'platform',
        },
        expectedChallenge: params.expectedChallenge,
        expectedOrigin: params.expectedOrigin,
        expectedRPID: params.expectedRPID,
        credential: {
          id: params.storedCredential.credentialId,
          publicKey: credentialPublicKey,
          counter: params.storedCredential.signCount,
        },
        requireUserVerification: true,
      });

      return {
        verified: verification.verified,
        newSignCount: verification.authenticationInfo?.newCounter ?? 0,
      };
    } catch (error) {
      console.error('WebAuthn authentication verification failed:', error);
      return {
        verified: false,
        newSignCount: 0,
      };
    }
  }

  /**
   * Extracts the x-coordinate from a COSE-encoded P-256 public key and
   * reduces it to fit within the Stark field (< STARK_PRIME).
   *
   * P-256 uses a 256-bit field, but Starknet's Stark curve uses ~251 bits.
   * We apply modular reduction to ensure the value is valid for Pedersen hash.
   */
  private extractP256XCoordinate(coseKey: Uint8Array_): string {
    const cosePublicKey = decodeCredentialPublicKey(coseKey);

    if (!cose.isCOSEPublicKeyEC2(cosePublicKey)) {
      throw new Error('Expected EC2 public key (P-256)');
    }

    const xCoord = cosePublicKey.get(cose.COSEKEYS.x);
    if (!xCoord) {
      throw new Error('Missing x coordinate in public key');
    }

    // Convert to bigint for modular reduction
    const xCoordBigInt = BigInt('0x' + Buffer.from(xCoord).toString('hex'));

    // Reduce to fit within Stark field (< STARK_PRIME)
    const reducedX = xCoordBigInt % STARK_PRIME;

    // Convert back to hex, padded to 64 characters
    return '0x' + reducedX.toString(16).padStart(64, '0');
  }
}
