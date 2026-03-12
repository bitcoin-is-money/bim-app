/**
 * Sets the session cookie with the given session ID and max age.
 */
export function setSessionCookie(
  ctx: {header: (name: string, value: string) => void},
  sessionId: string,
  maxAgeSec: number,
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  const cookie = [
    `session=${sessionId}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Strict',
    isProduction ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');

  ctx.header('Set-Cookie', cookie);
}

/**
 * Clears the session cookie.
 */
export function clearSessionCookie(ctx: {header: (name: string, value: string) => void}): void {
  ctx.header('Set-Cookie', 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
}
