export interface InvalidateSessionInput {
  sessionId: string;
}

/**
 * Invalidates a session (logout).
 */
export interface InvalidateSessionUseCase {
  execute(input: InvalidateSessionInput): Promise<void>;
}
