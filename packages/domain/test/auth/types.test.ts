import {ChallengeId, SessionId} from "@bim/domain/auth";
import {ValidationError} from "@bim/domain/shared";
import {describe, expect, it} from 'vitest';

describe('SessionId', () => {
  describe('of', () => {
    it('creates SessionId from valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const sessionId = SessionId.of(uuid);
      expect(sessionId).toBe(uuid);
    });

    it('throws for invalid UUID format', () => {
      expect(() => SessionId.of('not-a-uuid')).toThrow();
      expect(() => SessionId.of('')).toThrow();
    });
  });

  describe('generate', () => {
    it('generates valid UUID', () => {
      const sessionId = SessionId.generate();
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs', () => {
      const id1 = SessionId.generate();
      const id2 = SessionId.generate();
      expect(id1).not.toBe(id2);
    });
  });
});

describe('ChallengeId', () => {
  describe('of', () => {
    it('creates ChallengeId from valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const challengeId = ChallengeId.of(uuid);
      expect(challengeId).toBe(uuid);
    });

    it('throws ValidationError for invalid UUID format', () => {
      expect(() => ChallengeId.of('not-a-uuid')).toThrow(ValidationError);
      expect(() => ChallengeId.of('')).toThrow(ValidationError);
    });
  });

  describe('generate', () => {
    it('generates valid UUID', () => {
      const challengeId = ChallengeId.generate();
      expect(challengeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs', () => {
      const id1 = ChallengeId.generate();
      const id2 = ChallengeId.generate();
      expect(id1).not.toBe(id2);
    });
  });
});
