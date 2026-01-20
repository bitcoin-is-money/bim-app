import {AccountId} from "@bim/domain/account";
import {Session, SESSION_DURATION_MS, SessionExpiredError} from "@bim/domain/auth";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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
      const session = Session.create(accountId);

      expect(session.accountId).toBe(accountId);
    });

    it('generates unique session ID', () => {
      const session = Session.create(accountId);

      expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('sets expiration to SESSION_DURATION_MS from now', () => {
      const session = Session.create(accountId);

      const expectedExpiry = new Date(Date.now() + SESSION_DURATION_MS);
      expect(session.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('sets createdAt to current time', () => {
      const session = Session.create(accountId);

      expect(session.createdAt.getTime()).toBe(new Date('2024-01-15T12:00:00Z').getTime());
    });
  });

  describe('fromData', () => {
    it('reconstitutes session from persisted data', () => {
      const original = Session.create(accountId);
      const data = original.toData();

      const reconstituted = Session.fromData(data);

      expect(reconstituted.id).toBe(original.id);
      expect(reconstituted.accountId).toBe(original.accountId);
      expect(reconstituted.expiresAt.getTime()).toBe(original.expiresAt.getTime());
      expect(reconstituted.createdAt.getTime()).toBe(original.createdAt.getTime());
    });
  });

  describe('isExpired', () => {
    it('returns false before expiration', () => {
      const session = Session.create(accountId);

      expect(session.isExpired()).toBe(false);
    });

    it('returns false just before expiration', () => {
      const session = Session.create(accountId);

      vi.advanceTimersByTime(SESSION_DURATION_MS - 1000);

      expect(session.isExpired()).toBe(false);
    });

    it('returns true after expiration', () => {
      const session = Session.create(accountId);

      vi.advanceTimersByTime(SESSION_DURATION_MS + 1000);

      expect(session.isExpired()).toBe(true);
    });
  });

  describe('validate', () => {
    it('does not throw for valid session', () => {
      const session = Session.create(accountId);

      expect(() => session.validate()).not.toThrow();
    });

    it('throws SessionExpiredError if expired', () => {
      const session = Session.create(accountId);

      vi.advanceTimersByTime(SESSION_DURATION_MS + 1000);

      expect(() => session.validate()).toThrow(SessionExpiredError);
    });
  });

  describe('getRemainingTimeMs', () => {
    it('returns full duration immediately after creation', () => {
      const session = Session.create(accountId);

      expect(session.getRemainingTimeMs()).toBe(SESSION_DURATION_MS);
    });

    it('returns reduced time after some time has passed', () => {
      const session = Session.create(accountId);
      const elapsedMs = 60000; // 1 minute

      vi.advanceTimersByTime(elapsedMs);

      expect(session.getRemainingTimeMs()).toBe(SESSION_DURATION_MS - elapsedMs);
    });

    it('returns 0 after expiration', () => {
      const session = Session.create(accountId);

      vi.advanceTimersByTime(SESSION_DURATION_MS + 1000);

      expect(session.getRemainingTimeMs()).toBe(0);
    });
  });

  describe('toData', () => {
    it('exports all session data', () => {
      const session = Session.create(accountId);
      const data = session.toData();

      expect(data.id).toBe(session.id);
      expect(data.accountId).toBe(accountId);
      expect(data.expiresAt).toEqual(session.expiresAt);
      expect(data.createdAt).toEqual(session.createdAt);
    });
  });
});
