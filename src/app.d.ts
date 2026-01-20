import type { User } from './lib/db';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			requestId: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
