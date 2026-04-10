/**
 * HTTP client for E2E API production tests.
 *
 * Wraps fetch() to call the real production API.
 * Uses WEBAUTHN_ORIGIN as the base URL (the origin IS the server URL).
 */
export class E2eClient {
  readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const url = baseUrl ?? process.env.WEBAUTHN_ORIGIN;
    if (!url) {
      throw new Error('WEBAUTHN_ORIGIN is not set — is .env.e2e-api-prod loaded?');
    }
    this.baseUrl = url.replace(/\/$/, '');
  }

  async get(path: string, init?: RequestInit): Promise<Response> {
    const headers = init?.headers;
    return fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      ...(headers !== undefined && {headers}),
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
  }

  async post(path: string, body?: unknown, init?: RequestInit): Promise<Response> {
    const mergedHeaders = {
      'Content-Type': 'application/json',
      ...Object.fromEntries(new Headers(init?.headers)),
    };
    const jsonBody = body ? JSON.stringify(body) : null;
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: mergedHeaders,
      body: jsonBody,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
  }

  /**
   * Asserts the response is HTTP 200 and returns the parsed JSON body.
   * On failure, reads the error body and throws with the full context.
   */
  async expectOk<T>(response: Response, context: string): Promise<T> {
    if (response.status === 200) {
      return await response.json() as T;
    }
    const errorBody = await response.text().catch(() => '(unreadable body)');
    throw new Error(`${context} failed (HTTP ${response.status}): ${errorBody}`);
  }
}
