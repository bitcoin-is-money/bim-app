import { derived, writable } from 'svelte/store';

export interface CriticalFlowState {
	active: boolean;
	reason?: string;
	since?: number;
}

// Global guard to block navigation during critical flows (e.g., claim signing)
export const criticalFlow = writable<CriticalFlowState>({ active: false });

// Global signing indicator (e.g., WebAuthn prompt active)
export const signingCount = writable(0);
export const isSigning = derived(signingCount, ($c) => $c > 0);

export function beginSigning() {
	signingCount.update((n) => n + 1);
}

export function endSigning() {
	signingCount.update((n) => Math.max(0, n - 1));
}
