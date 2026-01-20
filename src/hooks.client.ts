/**
 * @fileoverview Client-side SvelteKit hooks for error tracking and monitoring
 *
 * This file configures client-side error tracking and monitoring for the WebAuthn
 * Starknet account deployment application. It handles:
 * - Browser-side error capture and logging
 * - Performance monitoring and tracing
 *
 * @author bim
 * @version 1.0.0
 */

// Buffer polyfill for browser environment
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
	// Create a Buffer-like interface that wraps Uint8Array
	class Buffer {
		private data: Uint8Array;

		constructor(input: any, _encoding?: any, _offset?: any) {
			if (typeof input === 'string') {
				// Handle string input
				const encoder = new TextEncoder();
				this.data = encoder.encode(input);
			} else if (input instanceof ArrayBuffer) {
				this.data = new Uint8Array(input);
			} else if (Array.isArray(input)) {
				this.data = new Uint8Array(input);
			} else if (input instanceof Uint8Array) {
				this.data = input;
			} else {
				this.data = new Uint8Array(input || 0);
			}
		}

		static from(input: any, encoding?: any): Buffer {
			return new Buffer(input, encoding);
		}

		static alloc(size: number): Buffer {
			return new Buffer(new Uint8Array(size));
		}

		static allocUnsafe(size: number): Buffer {
			return new Buffer(new Uint8Array(size));
		}

		static allocUnsafeSlow(size: number): Buffer {
			return new Buffer(new Uint8Array(size));
		}

		static isBuffer(obj: any): boolean {
			return obj instanceof Buffer;
		}

		static byteLength(string: string, _encoding?: string): number {
			if (typeof string === 'string') {
				return new TextEncoder().encode(string).length;
			}
			return 0;
		}

		static concat(list: Buffer[], totalLength?: number): Buffer {
			if (!Array.isArray(list)) {
				throw new TypeError('list argument must be an Array of Buffers');
			}

			if (list.length === 0) {
				return new Buffer(0);
			}

			let total = 0;
			if (totalLength === undefined) {
				for (let i = 0; i < list.length; i++) {
					const buf = list[i];
					if (buf) {
						total += buf.length;
					}
				}
			} else {
				total = totalLength;
			}

			const result = new Uint8Array(total);
			let offset = 0;
			for (let i = 0; i < list.length && offset < total; i++) {
				const buf = list[i];
				if (buf) {
					const len = Math.min(buf.length, total - offset);
					const bufData = buf.data || buf;
					result.set(bufData.slice(0, len), offset);
					offset += len;
				}
			}

			return new Buffer(result);
		}

		toString(encoding: string = 'utf8'): string {
			if (encoding === 'hex') {
				return Array.from(this.data)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			}
			const decoder = new TextDecoder();
			return decoder.decode(this.data);
		}

		// Implement array-like interface
		get length(): number {
			return this.data.length;
		}

		get buffer(): ArrayBufferLike {
			return this.data.buffer;
		}

		slice(start?: number, end?: number): Buffer {
			return new Buffer(this.data.slice(start, end));
		}

		copy(target: Buffer, targetStart: number = 0, start: number = 0, end?: number): number {
			const targetData = target instanceof Buffer ? target.data : new Uint8Array(target);
			const endIndex = end ?? this.data.length;

			const copyLength = Math.min(endIndex - start, targetData.length - targetStart);
			targetData.set(this.data.slice(start, start + copyLength), targetStart);

			return copyLength;
		}

		fill(value: number | string | Buffer, start: number = 0, end?: number): Buffer {
			const endIndex = end ?? this.data.length;

			if (typeof value === 'number') {
				this.data.fill(value, start, endIndex);
			} else if (typeof value === 'string') {
				const encoder = new TextEncoder();
				const encoded = encoder.encode(value);
				for (let i = start; i < endIndex; i++) {
					const byteValue = encoded[i % encoded.length];
					this.data[i] = byteValue ?? 0;
				}
			}

			return this;
		}

		write(string: string, offset: number = 0, length?: number, _encoding?: string): number {
			const encoder = new TextEncoder();
			const encoded = encoder.encode(string);
			const len = length || encoded.length;
			const end = Math.min(offset + len, this.data.length);

			for (let i = offset; i < end; i++) {
				const byteValue = encoded[i - offset];
				this.data[i] = byteValue ?? 0;
			}

			return end - offset;
		}

		readUInt8(offset: number): number {
			return this.data[offset] || 0;
		}

		readUInt16LE(offset: number): number {
			return (this.data[offset] || 0) | ((this.data[offset + 1] || 0) << 8);
		}

		readUInt32LE(offset: number): number {
			return (
				(this.data[offset] || 0) |
				((this.data[offset + 1] || 0) << 8) |
				((this.data[offset + 2] || 0) << 16) |
				((this.data[offset + 3] || 0) << 24)
			);
		}

		writeUInt8(value: number, offset: number): void {
			this.data[offset] = value;
		}

		writeUInt16LE(value: number, offset: number): void {
			this.data[offset] = value & 0xff;
			this.data[offset + 1] = (value >> 8) & 0xff;
		}

		writeUInt32LE(value: number, offset: number): void {
			this.data[offset] = value & 0xff;
			this.data[offset + 1] = (value >> 8) & 0xff;
			this.data[offset + 2] = (value >> 16) & 0xff;
			this.data[offset + 3] = (value >> 24) & 0xff;
		}
	}

	// @ts-ignore - Buffer polyfill
	window.Buffer = Buffer;
}

/**
 * Global client-side error handler with console logging
 *
 * This handler logs all unhandled errors that occur in the browser,
 * including:
 * - JavaScript runtime errors
 * - Unhandled promise rejections
 * - SvelteKit navigation errors
 * - Component rendering errors
 *
 * @param {Object} params - Error handling parameters
 * @param {Error} params.error - The error object that was thrown
 * @param {Object} params.event - The error event from SvelteKit
 * @returns {void}
 */
export const handleError = ({
	error,
	event
}: {
	error: unknown;
	event: { url?: { pathname?: string } };
}) => {
	const err = error as Error;
	console.error('Client-side error:', {
		message: err.message,
		stack: err.stack,
		url: event?.url?.pathname,
		userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
		timestamp: new Date().toISOString()
	});
};
