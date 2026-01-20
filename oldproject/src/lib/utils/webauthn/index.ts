export * from './WebauthnAttestation';
export * from './WebauthnCredentialData';
export * from './WebauthnOwner';

// Type for WebAuthn assertion data used in code generation
export interface WebauthnAssertion {
	r: Uint8Array;
	s: Uint8Array;
	yParity: boolean;
	messageHash: string;
	authenticatorData: Uint8Array;
	clientDataJSON: Uint8Array;
}
