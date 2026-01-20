/**
 * @fileoverview Environment Validation Utilities
 *
 * This module provides utilities for validating runtime environment and preventing
 * client/server service cross-contamination. It ensures services run in their
 * intended environments and fail fast with clear error messages.
 *
 * Key Features:
 * - Runtime environment detection (browser vs Node.js)
 * - Client/server service validation
 * - Clear error messages for environment violations
 * - Type-safe environment checks
 *
 * @author bim
 * @version 1.0.0
 */

/**
 * Environment types
 */
export type Environment = 'browser' | 'server' | 'unknown';

/**
 * Service type enumeration
 */
export enum ServiceType {
	CLIENT = 'client',
	SERVER = 'server',
	SHARED = 'shared'
}

/**
 * Environment validation error
 */
export class EnvironmentValidationError extends Error {
	constructor(
		public serviceType: ServiceType,
		public currentEnvironment: Environment,
		public expectedEnvironment: Environment | Environment[],
		message?: string
	) {
		const defaultMessage =
			message ||
			`${serviceType} service cannot run in ${currentEnvironment} environment. ` +
				`Expected: ${Array.isArray(expectedEnvironment) ? expectedEnvironment.join(' or ') : expectedEnvironment}`;

		super(defaultMessage);
		this.name = 'EnvironmentValidationError';
	}
}

/**
 * Detect current runtime environment
 */
export function detectEnvironment(): Environment {
	// Check if we're in a browser environment
	if (typeof window !== 'undefined' && typeof document !== 'undefined') {
		return 'browser';
	}

	// Check if we're in Node.js environment
	if (typeof global !== 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
		return 'server';
	}

	return 'unknown';
}

/**
 * Validate that a client service is running in browser environment
 */
export function validateClientEnvironment(serviceName: string): void {
	const currentEnv = detectEnvironment();

	if (currentEnv !== 'browser') {
		throw new EnvironmentValidationError(
			ServiceType.CLIENT,
			currentEnv,
			'browser',
			`Client service "${serviceName}" cannot run in ${currentEnv} environment. ` +
				'Client services require browser APIs and should only be used client-side.'
		);
	}
}

/**
 * Validate that a server service is running in Node.js environment
 */
export function validateServerEnvironment(serviceName: string): void {
	const currentEnv = detectEnvironment();

	if (currentEnv !== 'server') {
		throw new EnvironmentValidationError(
			ServiceType.SERVER,
			currentEnv,
			'server',
			`Server service "${serviceName}" cannot run in ${currentEnv} environment. ` +
				'Server services require Node.js APIs and should only be used server-side.'
		);
	}
}

/**
 * Validate that a shared service can run in either environment
 */
export function validateSharedEnvironment(serviceName: string): void {
	const currentEnv = detectEnvironment();

	if (currentEnv === 'unknown') {
		throw new EnvironmentValidationError(
			ServiceType.SHARED,
			currentEnv,
			['browser', 'server'],
			`Shared service "${serviceName}" cannot run in unknown environment. ` +
				'Shared services require either browser or Node.js environment.'
		);
	}
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
	return detectEnvironment() === 'browser';
}

/**
 * Check if running in server environment
 */
export function isServer(): boolean {
	return detectEnvironment() === 'server';
}

/**
 * Environment validation decorator for service methods
 */
export function validateEnvironment(serviceType: ServiceType, serviceName?: string) {
	return function (target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;

		descriptor.value = function (...args: any[]) {
			const name = serviceName || target.constructor.name;

			switch (serviceType) {
				case ServiceType.CLIENT:
					validateClientEnvironment(name);
					break;
				case ServiceType.SERVER:
					validateServerEnvironment(name);
					break;
				case ServiceType.SHARED:
					validateSharedEnvironment(name);
					break;
			}

			return originalMethod.apply(this, args);
		};

		return descriptor;
	};
}

/**
 * Environment validation for service constructors
 */
// Utility type for class constructors compatible with legacy decorators
type AnyConstructor<T = any> = abstract new (...args: any[]) => T;

/**
 * Class decorator factory asserting environment at construction time.
 * Returns a subclass of the target that performs the environment check,
 * but preserves the original constructor type to satisfy TS 5 expectations.
 */
export function requireEnvironment(serviceType: ServiceType, serviceName?: string) {
	return function <T extends AnyConstructor>(constructor: T): T {
		// Subclass that performs runtime environment validation before super()
		const Wrapped = class extends constructor {
			constructor(...args: any[]) {
				const name = serviceName || constructor.name;
				switch (serviceType) {
					case ServiceType.CLIENT:
						validateClientEnvironment(name);
						break;
					case ServiceType.SERVER:
						validateServerEnvironment(name);
						break;
					case ServiceType.SHARED:
						validateSharedEnvironment(name);
						break;
				}
				super(...args);
			}
		} as unknown as T;

		// Preserve static properties from the original constructor (best-effort)
		try {
			const source = constructor as unknown as Function;
			const target = Wrapped as unknown as Function;
			for (const key of Object.getOwnPropertyNames(source)) {
				if (key === 'length' || key === 'name' || key === 'prototype') continue;
				const desc = Object.getOwnPropertyDescriptor(source, key);
				if (desc) Object.defineProperty(target, key, desc);
			}
			// Keep class name for nicer stack traces
			Object.defineProperty(target, 'name', {
				value: (constructor as any).name,
				configurable: true
			});
		} catch {
			// Non-fatal: static copy is best-effort
		}

		return Wrapped;
	};
}
