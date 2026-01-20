// API Response Types for better type safety and validation

export interface DeployAccountResponse {
	transactionHash: string;
	accountAddress: string;
}

/**
 * Standard API error response structure
 * @deprecated Use ApiErrorResponse from api-response.ts for new code
 */
export interface ApiErrorResponse {
	error: string;
	details?: string;
}

/**
 * Standard API success response wrapper
 */
export interface ApiResponse<T = any> {
	data: T;
	success: true;
	meta?: {
		timestamp: string;
		requestId?: string;
	};
}

/**
 * Standard API error response wrapper
 */
export interface ApiErrorResponseWrapper {
	error: {
		code: string;
		message: string;
		details?: Record<string, any>;
		timestamp: string;
		requestId?: string;
	};
	success: false;
}

export interface AuthResponse {
	success: boolean;
	user?: {
		id: string;
		username: string;
		createdAt: string;
		credentialId?: string;
		publicKey?: string;
	};
	error?: string;
}

export interface TransactionResponse {
	transactionHash: string;
}

export interface HealthResponse {
	status: 'ok' | 'error';
	timestamp: string;
	database?: 'connected' | 'disconnected';
	details?: string;
}

// Type guards for runtime validation
export function isDeployAccountResponse(obj: any): obj is DeployAccountResponse {
	return (
		obj &&
		typeof obj === 'object' &&
		typeof obj.transactionHash === 'string' &&
		typeof obj.accountAddress === 'string'
	);
}

export function isApiErrorResponse(obj: any): obj is ApiErrorResponse {
	return obj && typeof obj === 'object' && typeof obj.error === 'string';
}

export function isAuthResponse(obj: any): obj is AuthResponse {
	return obj && typeof obj === 'object' && typeof obj.success === 'boolean';
}
