// Custom VM polyfill that provides the necessary functionality without using eval
// This is a minimal implementation for browser compatibility

export const vm = {
	// Create a new context (minimal implementation)
	createContext: (sandbox: any = {}) => {
		return sandbox;
	},

	// Run code in a context (minimal implementation)
	runInContext: (code: string, sandbox: any = {}, options?: any) => {
		// For security reasons, we don't actually execute the code
		// This is a minimal polyfill that should satisfy the import requirement
		console.warn('VM polyfill: runInContext called but not implemented for security reasons');
		return undefined;
	},

	// Run code in a new context (minimal implementation)
	runInNewContext: (code: string, sandbox: any = {}, options?: any) => {
		// For security reasons, we don't actually execute the code
		// This is a minimal polyfill that should satisfy the import requirement
		console.warn('VM polyfill: runInNewContext called but not implemented for security reasons');
		return undefined;
	},

	// Run code in this context (minimal implementation)
	runInThisContext: (code: string, options?: any) => {
		// For security reasons, we don't actually execute the code
		// This is a minimal polyfill that should satisfy the import requirement
		console.warn('VM polyfill: runInThisContext called but not implemented for security reasons');
		return undefined;
	},

	// Create a script (minimal implementation)
	createScript: (code: string, options?: any) => {
		return {
			runInContext: (sandbox: any = {}) => {
				console.warn(
					'VM polyfill: createScript.runInContext called but not implemented for security reasons'
				);
				return undefined;
			},
			runInNewContext: (sandbox: any = {}) => {
				console.warn(
					'VM polyfill: createScript.runInNewContext called but not implemented for security reasons'
				);
				return undefined;
			},
			runInThisContext: () => {
				console.warn(
					'VM polyfill: createScript.runInThisContext called but not implemented for security reasons'
				);
				return undefined;
			}
		};
	},

	// Check if code is cached
	isContext: (sandbox: any) => {
		return false;
	}
};

export default vm;
