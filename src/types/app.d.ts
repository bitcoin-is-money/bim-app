import type { User } from '$lib/db';

declare global {
	namespace App {
		interface Locals {
			user?: User;
			requestId?: string;
			authResult?: any;
		}
		// interface PageData {}
		// interface Error {}
		// interface Platform {}
	}
}

export {};
