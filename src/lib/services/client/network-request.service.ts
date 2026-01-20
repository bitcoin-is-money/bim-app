export interface NetworkRequestOptions {
	endpoint: string;
	timeoutDuration: number;
	debugEnabled: boolean;
	attempt: number;
}

export interface NetworkResponse<T = any> {
	data: T;
	ok: boolean;
	status: number;
}

export class NetworkRequestService {
	public async performConnectivityCheck(): Promise<boolean> {
		try {
			const healthCheck = await fetch('/api/health', {
				method: 'GET',
				signal: AbortSignal.timeout
					? AbortSignal.timeout(3000)
					: (() => {
							const controller = new AbortController();
							setTimeout(() => controller.abort(), 3000);
							return controller.signal;
						})()
			});

			const isHealthy = healthCheck.ok;
			console.log('🔍 Connectivity check result:', {
				healthy: isHealthy,
				status: healthCheck.status,
				timestamp: new Date().toISOString()
			});

			return isHealthy;
		} catch (error) {
			console.error('🔍 Connectivity check failed:', {
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			});
			return false;
		}
	}

	public async makeRequest<T = any>(options: NetworkRequestOptions): Promise<NetworkResponse<T>> {
		const { endpoint, timeoutDuration, debugEnabled, attempt } = options;

		if (debugEnabled) {
			console.log('🌐 Creating fetch request...', {
				endpoint,
				attempt,
				timestamp: new Date().toISOString()
			});
		}

		const abortController = new AbortController();
		const startTime = Date.now();
		let timeoutHandle: NodeJS.Timeout | null = null;
		let progressLogger: NodeJS.Timeout | null = null;

		try {
			if (debugEnabled) {
				console.log('⏰ Setting up Promise.race timeout with AbortController', {
					timeoutDuration,
					attempt,
					timestamp: new Date().toISOString()
				});
			}

			const timeoutPromise = new Promise<Response>((_, reject) => {
				timeoutHandle = setTimeout(() => {
					if (debugEnabled) {
						console.log('⏰ Timeout triggered - aborting request', {
							timeoutDuration,
							endpoint,
							attempt,
							elapsed: Date.now() - startTime,
							timestamp: new Date().toISOString()
						});
					}

					abortController.abort();
					const timeoutError = new Error(`Request timeout after ${timeoutDuration}ms`);
					timeoutError.name = 'TimeoutError';
					reject(timeoutError);
				}, timeoutDuration);
			});

			let requestState = 'pending';
			const fetchPromise = fetch(endpoint, {
				signal: abortController.signal,
				headers: {
					'Accept-Encoding': 'identity'
				}
			})
				.then((response) => {
					requestState = 'completed';
					if (debugEnabled) {
						console.log('🌐 Fetch promise resolved', {
							status: response.status,
							ok: response.ok,
							elapsed: Date.now() - startTime,
							timestamp: new Date().toISOString()
						});
					}

					if (timeoutHandle) {
						clearTimeout(timeoutHandle);
						timeoutHandle = null;
					}

					return response;
				})
				.catch((error) => {
					requestState = error.name === 'AbortError' ? 'aborted' : 'failed';
					if (debugEnabled) {
						console.log('🌐 Fetch promise rejected', {
							error: error.message,
							errorName: error.name,
							requestState,
							elapsed: Date.now() - startTime,
							timestamp: new Date().toISOString()
						});
					}
					throw error;
				});

			if (debugEnabled) {
				progressLogger = setInterval(() => {
					console.log('🔄 Request still pending...', {
						requestState,
						endpoint,
						attempt,
						elapsed: Date.now() - startTime,
						timestamp: new Date().toISOString()
					});
				}, 1000);
			}

			const response = await Promise.race([fetchPromise, timeoutPromise]);

			if (!response.ok) {
				return {
					data: null,
					ok: false,
					status: response.status
				};
			}

			const responseData = await response.json();
			return {
				data: responseData.data || responseData,
				ok: true,
				status: response.status
			};
		} catch (error) {
			if (error instanceof Error) {
				this.logNetworkError(error, { endpoint, attempt });
			}
			throw error;
		} finally {
			if (progressLogger) {
				clearInterval(progressLogger);
			}
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
		}
	}

	private logNetworkError(error: Error, context: { endpoint: string; attempt: number }) {
		const { endpoint, attempt } = context;

		if (error.message.includes('timeout') || error.message.includes('timed out')) {
			console.error('🌐 Request timed out:', {
				endpoint,
				attempt,
				error: error.message,
				errorName: error.name,
				timestamp: new Date().toISOString()
			});
		} else if (error.message.includes('fetch') || error.message.includes('network')) {
			console.error('🌐 Network error detected:', {
				endpoint,
				attempt,
				error: error.message,
				errorName: error.name,
				timestamp: new Date().toISOString()
			});
		} else {
			console.error('🌐 Unknown fetch error:', {
				endpoint,
				attempt,
				error: error.message,
				errorName: error.name,
				stack: error.stack?.substring(0, 200),
				timestamp: new Date().toISOString()
			});
		}
	}
}
