import type * as schema from '@bim/db';

export function createSessionData(
  accountId: string,
  overrides?: Partial<schema.NewSessionRecord>,
): schema.NewSessionRecord {
  return {
    id: crypto.randomUUID(), // Must be a pure UUID
    accountId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a test challenge record
 */
export function createChallengeData(overrides?: Partial<schema.NewChallengeRecord>): schema.NewChallengeRecord {
  const id = crypto.randomUUID();
  return {
    id,
    challenge: `challenge_${id}`,
    purpose: 'registration',
    rpId: 'localhost',
    origin: 'http://localhost:8080',
    used: false,
    expiresAt: new Date(Date.now() + 60 * 1000), // 60 seconds
    createdAt: new Date(),
    ...overrides,
  };
}
