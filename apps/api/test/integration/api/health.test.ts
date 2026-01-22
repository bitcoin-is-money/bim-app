import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createTestApp, request} from '../helpers/test-app.js';
import {closeTestDb} from '../helpers/test-context.js';
import type {Hono} from 'hono';

describe('Health API', () => {
  let app: Hono;

  beforeAll(() => {
    app = createTestApp();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('GET /api/health', () => {
    it('should return healthy status when database is connected', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({
        status: 'healthy',
        checks: {
          database: 'ok',
        },
      });
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/health/live', () => {
    it('should return live status', async () => {
      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({live: true});
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return ready status when database is connected', async () => {
      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({ready: true});
    });
  });
});
