/**
 * Payment method selection types for the Figma-inspired payment selector
 */

export type PaymentMethod = 'qr' | 'clipboard' | 'manual';

export interface PaymentMethodOption {
	id: PaymentMethod;
	title: string;
	icon: string;
	description: string;
}

export interface PaymentMethodSelectorProps {
	selectedMethod?: PaymentMethod;
	onMethodSelect?: (method: PaymentMethod) => void;
}

export interface PaymentMethodSelectorEvents {
	methodSelect: PaymentMethod;
}
