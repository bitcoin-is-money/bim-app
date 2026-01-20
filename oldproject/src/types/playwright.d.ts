import '@playwright/test';

declare module '@playwright/test' {
	interface BrowserContext {
		addVirtualAuthenticator(options: {
			protocol: 'ctap2' | 'u2f';
			transport: 'usb' | 'nfc' | 'ble' | 'internal';
			hasResidentKey?: boolean;
			hasUserVerification?: boolean;
			isUserVerified?: boolean;
		}): Promise<void>;

		clearVirtualAuthenticators(): Promise<void>;
	}
}
