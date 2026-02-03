
/**
 * API response type from /api/auth/register/begin
 */
export interface BeginRegistrationResponse {
  options: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    timeout?: number;
  };
  challengeId: string;
  accountId: string; // Pre-generated account ID - must be passed to completeRegistration
}

/**
 * API response type from /api/auth/register/complete
 */
export interface CompleteRegistrationResponse {
  account: {
    id: string;
    username: string;
    starknetAddress: string | null;
    status: string;
  };
}

/**
 * API response type from /api/auth/login/begin
 */
export interface BeginAuthenticationResponse {
  options: {
    challenge: string;
    rpId: string;
    allowCredentials?: Array<{
      id: string;
      type: 'public-key';
    }>;
    timeout?: number;
    userVerification?: 'required' | 'preferred' | 'discouraged';
  };
  challengeId: string;
}

/**
 * API response type from /api/auth/login/complete
 * (same as registration)
 */
export type CompleteAuthenticationResponse = CompleteRegistrationResponse;

/**
 * API response type from GET /api/auth/session (authenticated)
 */
export interface SessionResponse {
  authenticated: true;
  account: {
    id: string;
    username: string;
    starknetAddress: string | null;
    status: string;
  };
}

/**
 * API response type from POST /api/auth/logout
 */
export interface LogoutResponse {
  success: true;
}
