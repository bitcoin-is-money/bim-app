export interface InvalidateSessionInput {
  sessionId: string;
}

/**
 * Invalidates a session (logout).
 */
export interface InvalidateSessionUseCase {
  invalidate(input: InvalidateSessionInput): Promise<void>;
}
