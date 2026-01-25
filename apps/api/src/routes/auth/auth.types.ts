
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
    timeout: number;
  };
  challengeId: string;
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
    allowCredentials: Array<{
      id: string;
      type: 'public-key';
    }>;
    timeout: number;
  };
  challengeId: string;
}

/**
 * API response type from /api/auth/login/complete
 * (same as registration)
 */
export type CompleteAuthenticationResponse = CompleteRegistrationResponse;
