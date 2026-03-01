import {Challenge, CHALLENGE_DURATION_MS, ChallengeAlreadyUsedError, ChallengeExpiredError} from "@bim/domain/auth";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

describe('Challenge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createForRegistration', () => {
    it('creates registration challenge with correct properties', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      expect(challenge.purpose).toBe('registration');
      expect(challenge.rpId).toBe('localhost');
      expect(challenge.origin).toBe('http://localhost:3000');
      expect(challenge.isUsed()).toBe(false);
      expect(challenge.isExpired()).toBe(false);
      expect(challenge.challenge).toBeDefined();
      expect(challenge.challenge.length).toBeGreaterThan(0);
    });

    it('sets expiration to CHALLENGE_DURATION_MS from now', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      const expectedExpiry = new Date(Date.now() + CHALLENGE_DURATION_MS);
      expect(challenge.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });
  });

  describe('createForAuthentication', () => {
    it('creates authentication challenge for usernameless flow', () => {
      const challenge = Challenge.createForAuthentication({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      expect(challenge.purpose).toBe('authentication');
      expect(challenge.rpId).toBe('localhost');
      expect(challenge.origin).toBe('http://localhost:3000');
      expect(challenge.isUsed()).toBe(false);
      expect(challenge.isExpired()).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('returns false before expiration', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      expect(challenge.isExpired()).toBe(false);
    });

    it('returns true after expiration', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      vi.advanceTimersByTime(CHALLENGE_DURATION_MS + 1000);

      expect(challenge.isExpired()).toBe(true);
    });
  });

  describe('consume', () => {
    it('marks challenge as used', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      challenge.consume();

      expect(challenge.isUsed()).toBe(true);
    });

    it('throws ChallengeExpiredError if expired on consume', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      vi.advanceTimersByTime(CHALLENGE_DURATION_MS + 1000);

      expect(() => challenge.consume()).toThrow(ChallengeExpiredError);
    });

    it('throws ChallengeAlreadyUsedError if already used', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      challenge.consume();

      expect(() => challenge.consume()).toThrow(ChallengeAlreadyUsedError);
    });
  });

  describe('validate', () => {
    it('does not throw for valid challenge', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      expect(() => challenge.validate()).not.toThrow();
    });

    it('throws ChallengeExpiredError if expired on validate', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      vi.advanceTimersByTime(CHALLENGE_DURATION_MS + 1000);

      expect(() => challenge.validate()).toThrow(ChallengeExpiredError);
    });

    it('throws ChallengeAlreadyUsedError if used', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      challenge.consume();

      expect(() => challenge.validate()).toThrow(ChallengeAlreadyUsedError);
    });

    it('does not consume the challenge', () => {
      const challenge = Challenge.createForRegistration({
        rpId: 'localhost',
        origin: 'http://localhost:3000',
      });

      challenge.validate();

      expect(challenge.isUsed()).toBe(false);
    });
  });

});
