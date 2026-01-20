import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	// Suppress CommonJS resolver warnings during build while keeping errors visible
	logLevel: 'error',
	build: {
		// Production optimizations
		minify: mode === 'production',
		sourcemap: mode === 'development',
		target: 'esnext',
		rollupOptions: {
			onwarn(warning, defaultHandler) {
				// Suppress CommonJS resolveId hook warnings
				if (
					warning.message &&
					typeof warning.message === 'string' &&
					warning.message.includes('implemented a "resolveId" hook')
				) {
					return;
				}
				defaultHandler(warning);
			}
		}
	},
	// Enable decorator support
	esbuild: {
		target: 'esnext'
	},
	// Optimize dependencies including lightning decoders for better browser compatibility
	optimizeDeps: {
		include: ['bolt11', 'light-bolt11-decoder', '@atomiqlabs/chain-starknet'],
		// Force pre-bundling of bolt11 to avoid runtime issues
		force: mode === 'development'
	},
	// Define global variables for better browser compatibility
	define: {
		global: 'globalThis'
	},
	resolve: {
		alias: {
			// Provide Node.js polyfills for browser environment
			buffer: 'buffer',
			process: 'process/browser'
		}
	}
}));
