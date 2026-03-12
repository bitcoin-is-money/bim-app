import {AccountId} from "@bim/domain/account";
import {Session, SessionConfig, SessionExpiredError} from "@bim/domain/auth";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const DURATION_MS = SessionConfig.DEFAULT_DURATION_MS;

describe('Session', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('creates session with correct account ID', () => {
      const session = Session.create(accountId, DURATION_MS);

      expect(session.accountId).toBe(accountId);
    });

    it('generates unique session ID', () => {
      const session = Session.create(accountId, DURATION_MS);

      expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('sets expiration to durationMs from now', () => {
      const session = Session.create(accountId, DURATION_MS);

      const expectedExpiry = new Date(Date.now() + DURATION_MS);
      expect(session.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('uses custom duration when provided', () => {
      const customDuration = 5000;
      const session = Session.create(accountId, customDuration);

      const expectedExpiry = new Date(Date.now() + customDuration);
      expect(session.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('sets createdAt to current time', () => {
      const session = Session.create(accountId, DURATION_MS);

      expect(session.createdAt.getTime()).toBe(new Date('2024-01-15T12:00:00Z').getTime());
    });
  });

  describe('renew', () => {
    it('returns a new session with extended expiry', () => {
      const session = Session.create(accountId, DURATION_MS);

      vi.advanceTimersByTime(60_000); // 1 minute later

      const renewed = session.renew(DURATION_MS);

      expect(renewed.expiresAt.getTime()).toBe(Date.now() + DURATION_MS);
    });

    it('preserves id, accountId, and createdAt', () => {
      const session = Session.create(accountId, DURATION_MS);

      vi.advanceTimersByTime(60_000);

      const renewed = session.renew(DURATION_MS);

      expect(renewed.id).toBe(session.id);
      expect(renewed.accountId).toBe(session.accountId);
      expect(renewed.createdAt).toBe(session.createdAt);
    });

    it('uses the provided duration for the new expiry', () => {
      const session = Session.create(accountId, DURATION_MS);
      const shortDuration = 3000;

      const renewed = session.renew(shortDuration);

      expect(renewed.expiresAt.getTime()).toBe(Date.now() + shortDuration);
    });
  });

  describe('isExpired', () => {
    it('returns false before expiration', () => {
      const session = Session.create(accountId, DURATION_MS);

      expect(session.isExpired()).toBe(false);
    });

    it('returns false just before expiration', () => {
      const session = Session.create(accountId, DURATION_MS);

      vi.advanceTimersByTime(DURATION_MS - 1000);

      expect(session.isExpired()).toBe(false);
    });

    it('returns true after expiration', () => {
      const session = Session.create(accountId, DURATION_MS);

      vi.advanceTimersByTime(DURATION_MS + 1000);

      expect(session.isExpired()).toBe(true);
    });
  });

  describe('validate', () => {
    it('does not throw for valid session', () => {
      const session = Session.create(accountId, DURATION_MS);

      expect(() => { session.validate(); }).not.toThrow();
    });

    it('throws SessionExpiredError if expired', () => {
      const session = Session.create(accountId, DURATION_MS);

      vi.advanceTimersByTime(DURATION_MS + 1000);

      expect(() => { session.validate(); }).toThrow(SessionExpiredError);
    });
  });

  describe('getRemainingTimeMs', () => {
    it('returns full duration immediately after creation', () => {
      const session = Session.create(accountId, DURATION_MS);

      expect(session.getRemainingTimeMs()).toBe(DURATION_MS);
    });

    it('returns reduced time after some time has passed', () => {
      const session = Session.create(accountId, DURATION_MS);
      const elapsedMs = 60000; // 1 minute

      vi.advanceTimersByTime(elapsedMs);

      expect(session.getRemainingTimeMs()).toBe(DURATION_MS - elapsedMs);
    });

    it('returns 0 after expiration', () => {
      const session = Session.create(accountId, DURATION_MS);

      vi.advanceTimersByTime(DURATION_MS + 1000);

      expect(session.getRemainingTimeMs()).toBe(0);
    });
  });
});
