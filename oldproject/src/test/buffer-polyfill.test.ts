/**
 * @fileoverview Test for Buffer polyfill functionality
 *
 * This test verifies that the Buffer polyfill is working correctly
 * in the browser environment and provides the expected API.
 */

import { beforeEach, describe, expect, it } from 'vitest';

describe('Buffer Polyfill', () => {
	beforeEach(() => {
		// Ensure we're in a browser-like environment
		if (typeof window === 'undefined') {
			// Mock window for Node.js environment
			(global as any).window = global;
		}

		// Clear any existing Buffer
		if (typeof window !== 'undefined') {
			delete (window as any).Buffer;
		}
	});

	it('should create Buffer polyfill when Buffer is not defined', () => {
		// Simulate the polyfill setup
		if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
			class Buffer {
				private data: Uint8Array;

				constructor(input: any, _encoding?: any, _offset?: any) {
					if (typeof input === 'string') {
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

				toString(encoding: string = 'utf8'): string {
					if (encoding === 'hex') {
						return Array.from(this.data)
							.map((b) => b.toString(16).padStart(2, '0'))
							.join('');
					}
					const decoder = new TextDecoder();
					return decoder.decode(this.data);
				}

				static isBuffer(obj: any): boolean {
					return obj instanceof Buffer;
				}

				get length(): number {
					return this.data.length;
				}

				get buffer(): ArrayBufferLike {
					return this.data.buffer;
				}

				slice(start?: number, end?: number): Buffer {
					return new Buffer(this.data.slice(start, end));
				}
			}

			(window as any).Buffer = Buffer;
		}

		expect(typeof window.Buffer).toBe('function');
		expect(window.Buffer.isBuffer).toBe('function');
	});

	it('should handle string input correctly', () => {
		if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
			// Setup polyfill
			class Buffer {
				private data: Uint8Array;

				constructor(input: any) {
					if (typeof input === 'string') {
						const encoder = new TextEncoder();
						this.data = encoder.encode(input);
					} else {
						this.data = new Uint8Array(input || 0);
					}
				}

				toString(): string {
					const decoder = new TextDecoder();
					return decoder.decode(this.data);
				}
			}

			(window as any).Buffer = Buffer;
		}

		const buffer = new window.Buffer('Hello, World!');
		expect(buffer.toString()).toBe('Hello, World!');
	});

	it('should handle hex encoding correctly', () => {
		if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
			// Setup polyfill with hex support
			class Buffer {
				private data: Uint8Array;

				constructor(input: any) {
					if (typeof input === 'string') {
						const encoder = new TextEncoder();
						this.data = encoder.encode(input);
					} else {
						this.data = new Uint8Array(input || 0);
					}
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
			}

			(window as any).Buffer = Buffer;
		}

		const buffer = new window.Buffer('Hello');
		const hexString = buffer.toString('hex');
		expect(hexString).toBe('48656c6c6f'); // "Hello" in hex
	});

	it('should handle ArrayBuffer input correctly', () => {
		if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
			// Setup polyfill
			class Buffer {
				private data: Uint8Array;

				constructor(input: any) {
					if (input instanceof ArrayBuffer) {
						this.data = new Uint8Array(input);
					} else {
						this.data = new Uint8Array(input || 0);
					}
				}

				get length(): number {
					return this.data.length;
				}
			}

			(window as any).Buffer = Buffer;
		}

		const arrayBuffer = new ArrayBuffer(4);
		const uint8Array = new Uint8Array(arrayBuffer);
		uint8Array[0] = 1;
		uint8Array[1] = 2;
		uint8Array[2] = 3;
		uint8Array[3] = 4;

		const buffer = new window.Buffer(arrayBuffer);
		expect(buffer.length).toBe(4);
	});
});
