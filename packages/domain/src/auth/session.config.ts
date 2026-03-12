/**
 * Configuration for session management.
 */
export interface SessionConfig {
  readonly durationMs: number;
}

export namespace SessionConfig {
  /** Default session duration: 15 minutes of inactivity before expiry. */
  export const DEFAULT_DURATION_MS = 15 * 60 * 1000;

  /**
   * Creates a validated SessionConfig.
   * @throws Error if durationMs is not positive.
   */
  export function create(params: {durationMs: number}): SessionConfig {
    if (params.durationMs <= 0) {
      throw new Error(`Invalid session duration: ${params.durationMs}ms. Must be positive.`);
    }
    return {durationMs: params.durationMs};
  }
}
