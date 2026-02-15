import type {
  AuthenticationVerificationResult,
  RegistrationVerificationResult,
  VerifyAuthenticationParams,
  VerifyRegistrationParams,
  WebAuthnGateway,
} from '@bim/domain/ports';
import {type Uint8Array_, verifyAuthenticationResponse, verifyRegistrationResponse,} from '@simplewebauthn/server';
import {cose, decodeCredentialPublicKey,} from '@simplewebauthn/server/helpers';
import {basename} from 'node:path';
import type {Logger} from "pino";
import type {WebAuthnConfig} from '../../app-config';

/**
 * SimpleWebAuthn-based implementation of WebAuthnGateway.
 */
export class SimpleWebAuthnGateway implements WebAuthnGateway {
  private readonly log: Logger;

  constructor(
    private readonly config: Pick<WebAuthnConfig, 'authenticatorAttachment'>,
    rootLogger: Logger,
  ) {
    this.log = rootLogger.child({name: basename(import.meta.filename)});
  }

  async verifyRegistration(
    params: VerifyRegistrationParams,
  ): Promise<RegistrationVerificationResult> {
    this.log.debug({rpId: params.expectedRPID}, 'Verifying WebAuthn registration');
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
          authenticatorAttachment: this.config.authenticatorAttachment,
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

      const {registrationInfo} = verification;

      // Extract the public key in a format we can use
      const encodedCredentialPublicKey: Base64URLString = Buffer.from(
        registrationInfo.credential.publicKey,
      ).toString('base64url');

      // Extract the credential ID
      // In SimpleWebAuthn v13+, credential.id is already a base64url string
      const encodedCredentialId: Base64URLString = registrationInfo.credential.id;

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
    } catch (err) {
      this.log.error({err}, 'WebAuthn registration verification failed');
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
    this.log.debug({
        credentialId: params.storedCredential.credentialId,
        rpId: params.expectedRPID
      },'Verifying WebAuthn authentication');
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
          authenticatorAttachment: this.config.authenticatorAttachment,
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
    } catch (err) {
      this.log.error({err}, 'WebAuthn authentication verification failed');
      return {
        verified: false,
        newSignCount: 0,
      };
    }
  }

  /**
   * Extracts the x-coordinate from a COSE-encoded P-256 public key.
   *
   * Returns the full 256-bit value (NOT reduced mod STARK_PRIME) because
   * the Argent contract stores it as u256 (two 128-bit felts).
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

    const xCoordBigInt = BigInt('0x' + Buffer.from(xCoord).toString('hex'));

    return '0x' + xCoordBigInt.toString(16).padStart(64, '0');
  }
}
