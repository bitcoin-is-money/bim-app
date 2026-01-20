# Security Model & Threat Analysis

> **Last Updated**: 2026-01-13
> **Version**: 1.0.0
> **Based on**: SEC_REVIEW.md (2025-09-03)

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Security Posture](#security-posture)
3. [Critical Vulnerabilities](#critical-vulnerabilities)
4. [Authentication Security](#authentication-security)
5. [API Security](#api-security)
6. [Rate Limiting & DDoS Protection](#rate-limiting--ddos-protection)
7. [Input Validation](#input-validation)
8. [Cryptographic Operations](#cryptographic-operations)
9. [Operational Security](#operational-security)
10. [Security Development Lifecycle](#security-development-lifecycle)
11. [Incident Response](#incident-response)
12. [Compliance & Best Practices](#compliance--best-practices)

---

## Executive Summary

### Current Security Status

**Overall Assessment**: Good baseline hardening but **NOT production-ready** without addressing critical findings.

**Security Strengths** ✅:
- Comprehensive security headers (CSP, HSTS, X-Frame-Options)
- Input validation middleware with sanitization
- Multi-tier rate limiting (IP + User + Endpoint)
- Parameterized database queries (Drizzle ORM)
- CORS properly configured
- Method allowlisting for RPC proxy

**Critical Risks** ⚠️:
1. **WebAuthn Implementation** - Missing server challenge validation (CRITICAL)
2. **Debug Endpoints** - Deployable in production (CRITICAL)
3. **RPC Proxy** - Unauthenticated public access (HIGH)
4. **Webhook Verification** - Incorrect signature validation (HIGH)

**Security Score**: 6.5/10
- **Recommendation**: Block production deployment until critical issues resolved

---

## Security Posture

### Defense-in-Depth Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Network Security                                   │
│  • Railway HTTPS/TLS (automatic)                            │
│  • DNS security                                             │
│  • DDoS protection (Railway-provided)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Application Security Headers                       │
│  • CSP: Prevents XSS and injection attacks                  │
│  • HSTS: Forces HTTPS connections                           │
│  • X-Frame-Options: Prevents clickjacking                   │
│  • X-Content-Type-Options: Prevents MIME sniffing           │
│  • Permissions-Policy: Limits browser API access            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Rate Limiting & Throttling                        │
│  • IP-based rate limiting                                   │
│  • User-based rate limiting                                 │
│  • Endpoint-specific limits                                 │
│  • Progressive penalties (exponential backoff)              │
│  ⚠️ LIMITATION: In-memory only (not shared across replicas) │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Authentication & Authorization                     │
│  • WebAuthn (passkey/biometric)                             │
│  • Server-side session management                           │
│  • Endpoint protection middleware                           │
│  ⚠️ CRITICAL: WebAuthn ceremony incomplete                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Input Validation & Sanitization                   │
│  • Schema-based validation                                  │
│  • Type-specific sanitizers (addresses, amounts)            │
│  • Injection prevention (HTML, SQL, XSS)                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 6: Data Security                                      │
│  • PostgreSQL with SSL connections                          │
│  • Parameterized queries (Drizzle ORM)                      │
│  • Session data encrypted in transit                        │
│  ⚠️ NOTE: No encryption at rest configured                  │
└─────────────────────────────────────────────────────────────┘
```

### Security by Design Principles

#### 1. Least Privilege
✅ **Implemented**:
- Session-based authentication (not JWT with overly broad scopes)
- Endpoint-specific protection levels
- Database user with minimal permissions

❌ **Missing**:
- Role-based access control (RBAC)
- Admin vs regular user distinction
- Granular permission system

#### 2. Defense in Depth
✅ **Implemented**:
- Multiple security layers (see diagram above)
- Redundant validation (client + server)

❌ **Missing**:
- Web Application Firewall (WAF)
- Intrusion Detection System (IDS)

#### 3. Fail Securely
✅ **Implemented**:
- Secure error messages (no internal details leaked)
- Database connection failures logged but not exposed
- Rate limit violations logged

⚠️ **Concern**:
- Debug endpoints can leak sensitive information

#### 4. Zero Trust
❌ **Not Implemented**:
- RPC proxy trusts all requests (no authentication)
- Internal service calls not verified

---

## Critical Vulnerabilities

### 🔴 CRITICAL #1: WebAuthn Ceremony Incomplete

**Impact**: Account takeover, replay attacks, cross-origin authentication bypass

**CVE Equivalent**: CWE-287 (Improper Authentication)

#### Current Implementation Problems

**Location**: `src/routes/api/auth/register/+server.ts`, `src/routes/api/auth/login/+server.ts`

**Missing Security Controls**:

1. **No Server-Side Challenge Generation**
   ```typescript
   // CURRENT (INSECURE):
   // Client generates challenge, server blindly accepts

   // SHOULD BE:
   // 1. Server generates cryptographically random challenge
   // 2. Store in database with expiry (60 seconds)
   // 3. Validate challenge in completion endpoint
   // 4. Mark challenge as used (single-use)
   ```

2. **No Origin Validation**
   ```typescript
   // MISSING:
   const clientData = JSON.parse(
     base64url.decode(response.clientDataJSON)
   );

   if (clientData.origin !== EXPECTED_ORIGIN) {
     throw new Error('Origin mismatch');
   }
   ```

3. **No RP ID Validation**
   ```typescript
   // MISSING:
   const rpIdHash = sha256(RP_ID);
   if (!authenticatorData.rpIdHash.equals(rpIdHash)) {
     throw new Error('RP ID hash mismatch');
   }
   ```

4. **No Sign Counter Enforcement**
   ```typescript
   // MISSING:
   if (newSignCount <= storedSignCount) {
     // Potential cloned authenticator
     throw new Error('Sign counter anomaly detected');
   }
   ```

5. **No Authenticator Data Flags Validation**
   ```typescript
   // MISSING:
   const flags = authenticatorData[32];
   const userPresent = (flags & 0x01) !== 0;    // UP flag
   const userVerified = (flags & 0x04) !== 0;   // UV flag

   if (!userPresent || !userVerified) {
     throw new Error('User presence/verification required');
   }
   ```

#### Attack Scenarios

**Scenario 1: Replay Attack**
```
1. Attacker captures valid WebAuthn assertion
2. Attacker replays assertion to server
3. Server accepts (no challenge validation)
4. ✅ Attacker gains access
```

**Scenario 2: Cross-Origin Attack**
```
1. Attacker hosts phishing site at evil.com
2. User unknowingly creates credential for evil.com
3. Attacker uses credential against real site
4. Server accepts (no origin validation)
5. ✅ Attacker gains access
```

#### Remediation (REQUIRED for Production)

**Option 1: Use SimpleWebAuthn Library** (RECOMMENDED)

```typescript
// Installation
npm install @simplewebauthn/server @simplewebauthn/browser

// Registration Begin
import { generateRegistrationOptions } from '@simplewebauthn/server';

export async function GET({ locals }) {
  const options = await generateRegistrationOptions({
    rpName: 'BIM-BIM',
    rpID: 'yourdomain.com',
    userID: locals.userId,
    userName: locals.username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'
    }
  });

  // Store challenge in database
  await db.insert(webauthnChallenges).values({
    challenge: options.challenge,
    purpose: 'registration',
    userId: locals.userId,
    expiresAt: new Date(Date.now() + 60000) // 60 seconds
  });

  return json(options);
}

// Registration Complete
import { verifyRegistrationResponse } from '@simplewebauthn/server';

export async function POST({ request, locals }) {
  const response = await request.json();

  // Fetch stored challenge
  const storedChallenge = await db.query.webauthnChallenges.findFirst({
    where: and(
      eq(webauthnChallenges.userId, locals.userId),
      eq(webauthnChallenges.purpose, 'registration'),
      eq(webauthnChallenges.used, false),
      gt(webauthnChallenges.expiresAt, new Date())
    )
  });

  if (!storedChallenge) {
    throw error(400, 'Challenge expired or already used');
  }

  // Verify registration
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: EXPECTED_ORIGIN,
    expectedRPID: RP_ID
  });

  if (!verification.verified) {
    throw error(400, 'Registration verification failed');
  }

  // Mark challenge as used
  await db.update(webauthnChallenges)
    .set({ used: true })
    .where(eq(webauthnChallenges.id, storedChallenge.id));

  // Store credential
  await db.update(users).set({
    credentialId: verification.registrationInfo.credentialID,
    credentialPublicKey: verification.registrationInfo.credentialPublicKey,
    signCount: verification.registrationInfo.counter,
    rpId: RP_ID
  }).where(eq(users.id, locals.userId));

  return json({ verified: true });
}
```

**Option 2: Manual Implementation** (Not Recommended)

If you must implement manually:

1. **Add Challenge Storage** (Already exists in DB schema: `webauthn_challenges` table)
2. **Generate Challenges Server-Side**
   ```typescript
   import { randomBytes } from 'crypto';
   const challenge = base64url.encode(randomBytes(32));
   ```
3. **Implement Full Validation** (see SEC_REVIEW.md line 28-37 for checklist)

**Timeline**: MUST be fixed before production launch

---

### 🔴 CRITICAL #2: Debug Endpoints Deployable

**Impact**: Database wipe, data loss, denial of service

**CVE Equivalent**: CWE-489 (Active Debug Code)

#### Vulnerable Endpoints

**Location**: `src/routes/api/debug/`

| Endpoint | Risk | Current Protection | Attack Scenario |
|----------|------|-------------------|-----------------|
| `/api/debug/reset-db` | CRITICAL | Session auth only | Any authenticated user can wipe `users` table |
| `/api/debug/schema` | MEDIUM | Session auth only | Schema information disclosure |
| `/api/debug/auth-status` | LOW | Session auth only | Session enumeration |

#### Current Code (INSECURE)

**File**: `src/routes/api/debug/reset-db/+server.ts`

```typescript
export async function POST({ locals }) {
  // PROBLEM: No NODE_ENV check, no role check

  // Delete all users
  await db.delete(users);

  return json({ message: 'Database reset successfully' });
}
```

#### Remediation (REQUIRED for Production)

**Option 1: Disable in Production** (RECOMMENDED)

```typescript
// Add to ALL debug endpoints
export async function POST({ locals }) {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    throw error(404, 'Not found');
  }

  // ... rest of debug logic
}
```

**Option 2: Restrict by Role + IP**

```typescript
const ADMIN_IPS = process.env.ADMIN_IPS?.split(',') || [];
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function POST({ request, locals, getClientAddress }) {
  // Check production environment
  if (process.env.NODE_ENV === 'production') {
    const clientIP = getClientAddress();

    // Require internal API key
    const apiKey = request.headers.get('X-Internal-Key');
    if (apiKey !== INTERNAL_API_KEY) {
      throw error(401, 'Unauthorized');
    }

    // Require admin IP
    if (!ADMIN_IPS.includes(clientIP)) {
      throw error(403, 'Forbidden');
    }

    // Log access
    logger.security('Debug endpoint accessed', {
      endpoint: '/api/debug/reset-db',
      ip: clientIP,
      user: locals.user?.username
    });
  }

  // ... debug logic
}
```

**Option 3: Remove from Build**

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      external: process.env.NODE_ENV === 'production'
        ? ['src/routes/api/debug/**']
        : []
    }
  }
});
```

**Timeline**: MUST be fixed before production launch

---

### 🔴 HIGH #3: RPC Proxy Unauthenticated

**Impact**: RPC quota exhaustion, cost leakage, service availability

**CVE Equivalent**: CWE-306 (Missing Authentication for Critical Function)

#### Current Implementation

**Location**: `src/lib/middleware/auth.ts`

```typescript
export const ENDPOINT_PROTECTION: Record<string, keyof typeof authMiddleware> = {
  '/api/rpc': 'rpc',
  '/api/rpc-call': 'rpc',
  // ...
};

export const authMiddleware = {
  rpc: {
    requireAuth: false,  // ❌ PROBLEM: Public access
    allowedMethods: ['GET', 'POST'],
    rateLimit: { requests: 50, window: 60000 }
  }
};
```

**Why This Exists**:
- RPC proxy designed for client-side use
- Avoids CORS issues
- Centralizes RPC URL management

**Why This is Dangerous**:
- Anyone can call your private RPC
- RPC providers charge per request
- Can exhaust rate limits affecting legitimate users

#### Attack Scenario

```bash
# Attacker script
while true; do
  curl -X POST https://yourdomain.com/api/rpc \
    -H "Content-Type: application/json" \
    -d '{"method":"starknet_getBlockWithTxHashes","params":[{"block_number":1000000}]}'
  sleep 0.1
done

# Result:
# - 600 requests/minute
# - Exceeds rate limit
# - Legitimate users blocked
# - RPC bill increases
```

#### Remediation (REQUIRED for Production)

**Option 1: Require Session Authentication** (RECOMMENDED)

```typescript
export const authMiddleware = {
  rpc: {
    requireAuth: true,  // ✅ Require session
    allowedMethods: ['POST'],
    rateLimit: { requests: 50, window: 60000 }
  }
};
```

**Pros**: Simple, effective
**Cons**: RPC calls require user login

**Option 2: Internal API Key**

```typescript
// hooks.server.ts
if (event.url.pathname.startsWith('/api/rpc')) {
  const apiKey = event.request.headers.get('X-API-Key');

  if (apiKey !== process.env.INTERNAL_RPC_KEY) {
    throw error(401, 'Invalid API key');
  }
}
```

**Option 3: Per-User Quotas with Redis**

```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

async function checkUserRPCQuota(userId: string): Promise<boolean> {
  const key = `rpc:quota:${userId}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 86400); // 24 hours
  }

  return count <= 1000; // 1000 requests per day
}
```

**Option 4: Remove RPC Proxy Entirely**

Use client-side RPC calls directly:
- Configure CORS on your RPC provider
- Use public RPC URLs (not private keys)
- Implement client-side rate limiting

**Timeline**: MUST be fixed before production launch

---

### 🔴 HIGH #4: Webhook Signature Verification Incorrect

**Impact**: Malicious webhook injection, unauthorized balance updates, fake swap completions

**CVE Equivalent**: CWE-345 (Insufficient Verification of Data Authenticity)

#### Current Implementation (INSECURE)

**Location**: `src/lib/services/server/webhook/signature-verifier.service.ts`

```typescript
export class SignatureVerifier {
  verifySignature(
    payload: any,  // ❌ Already parsed JSON
    signature: string,
    secret: string
  ): boolean {
    // ❌ PROBLEM: Re-stringifying JSON changes ordering
    const payloadString = JSON.stringify(payload);

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    // ❌ PROBLEM: Not constant-time comparison
    return expectedSignature === signature;
  }
}
```

#### Why This is Wrong

**Problem 1: JSON Canonicalization**
```javascript
// Original webhook body (order matters for signature):
{"event":"payment","swapId":"123","amount":1000}

// After JSON.parse() and JSON.stringify():
{"amount":1000,"event":"payment","swapId":"123"}  // Different order!

// Result: Signature mismatch for valid webhooks
```

**Problem 2: Timing Attack**
```javascript
// String comparison leaks timing information
expectedSignature === signature

// Attacker can brute-force signature byte-by-byte
// Each correct byte takes slightly longer to compare
```

#### Remediation (REQUIRED for Production)

**Correct Implementation**:

```typescript
import crypto from 'crypto';

export async function POST({ request }) {
  // 1. Get raw body BEFORE parsing
  const rawBody = await request.text();

  // 2. Get signature from header
  const signature = request.headers.get('X-Webhook-Signature');
  if (!signature) {
    throw error(401, 'Missing signature');
  }

  // 3. Get timestamp (for replay protection)
  const timestamp = request.headers.get('X-Webhook-Timestamp');
  if (!timestamp) {
    throw error(401, 'Missing timestamp');
  }

  // 4. Check timestamp freshness (5-minute window)
  const webhookTime = new Date(timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - webhookTime) > 300000) {
    throw error(401, 'Webhook too old');
  }

  // 5. Compute expected signature over raw body
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex');

  // 6. Constant-time comparison
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    // Log failed attempt
    logger.security('Webhook signature verification failed', {
      endpoint: request.url,
      signature: signature.substring(0, 8) + '...'
    });

    throw error(401, 'Invalid signature');
  }

  // 7. NOW parse the body
  const payload = JSON.parse(rawBody);

  // 8. Process webhook
  // ...
}
```

**Additional Security**:

```typescript
// Store processed webhook IDs to prevent replay
const processedWebhooks = new Set<string>();

export async function POST({ request }) {
  // ... signature verification ...

  const webhookId = request.headers.get('X-Webhook-ID');

  if (processedWebhooks.has(webhookId)) {
    throw error(409, 'Webhook already processed');
  }

  processedWebhooks.add(webhookId);

  // Process webhook
  // ...
}
```

**Timeline**: MUST be fixed before production launch

---

## Authentication Security

### Session Management

**Current Implementation**: Server-side sessions with PostgreSQL storage

#### Session Lifecycle

```
┌────────────────────────────────────────────────────────────┐
│                     Session Creation                        │
└────────────────────────────────────────────────────────────┘

1. User completes WebAuthn authentication
   ↓
2. Server creates session record in database
   ↓
3. Session ID (UUID) stored in cookie
   ↓
4. Cookie properties:
   • httpOnly: true (prevents XSS access)
   • secure: true (HTTPS only in production)
   • sameSite: 'strict' (prevents CSRF)
   • maxAge: 7 days
   ↓
5. Session validated on every request (hooks.server.ts)
```

**Location**: `src/lib/auth/session.ts`

#### Session Security Checklist

✅ **Current Protections**:
- HttpOnly cookies (XSS protection)
- SameSite=Strict (CSRF protection)
- Server-side storage (not JWT)
- UUID session IDs (high entropy)

⚠️ **Concerns from SEC_REVIEW**:

1. **Cookie Not Cleared on Expired Session**
   ```typescript
   // CURRENT (src/lib/auth/session.ts):
   export async function validateSession(sessionId: string) {
     const session = await db.query.sessions.findFirst({
       where: eq(sessions.id, sessionId)
     });

     if (!session || session.expiresAt < new Date()) {
       return null;  // ❌ Cookie remains in browser
     }

     return session;
   }

   // SHOULD BE:
   export async function validateSession(
     sessionId: string,
     cookies: Cookies
   ) {
     const session = await db.query.sessions.findFirst({
       where: eq(sessions.id, sessionId)
     });

     if (!session || session.expiresAt < new Date()) {
       // Delete expired session from DB
       await db.delete(sessions).where(eq(sessions.id, sessionId));

       // Clear cookie
       cookies.delete('session', { path: '/' });

       return null;
     }

     return session;
   }
   ```

2. **SESSION_SECRET Not Used**
   ```typescript
   // Environment variable exists but unused
   SESSION_SECRET=abc123...

   // If intended for cookie signing, implement:
   import { seal, unseal } from '@hapi/iron';

   async function createSignedSession(sessionId: string) {
     return await seal(
       sessionId,
       process.env.SESSION_SECRET!,
       { ttl: 0 }
     );
   }
   ```

3. **No __Host- Prefix**
   ```typescript
   // CURRENT:
   cookies.set('session', sessionId, { ... });

   // MORE SECURE:
   cookies.set('__Host-session', sessionId, {
     httpOnly: true,
     secure: true,  // Required for __Host-
     sameSite: 'strict',
     path: '/'  // Required for __Host-
   });
   ```

   **Benefits of __Host- prefix**:
   - Prevents subdomain attacks
   - Ensures secure + path=/ + no domain
   - Browser enforces strict rules

#### Session Fixation Protection

✅ **Currently Protected**:
- New session ID generated on login (not reused)
- Old session not preserved after auth

#### Session Hijacking Protection

✅ **Current Protections**:
- HttpOnly (can't be read by JavaScript)
- Secure (HTTPS only)
- SameSite=Strict (can't be sent cross-origin)

❌ **Missing Protections**:
- No session binding to IP address
- No User-Agent validation
- No session rotation after privilege change

**Recommendation**:
```typescript
interface Session {
  id: string;
  userId: string;
  createdIP: string;      // NEW
  lastSeenIP: string;     // NEW
  userAgent: string;      // NEW
  expiresAt: Date;
}

// Validate session
export async function validateSession(
  sessionId: string,
  request: Request
) {
  const session = await getSession(sessionId);
  const currentIP = request.headers.get('x-forwarded-for');
  const currentUA = request.headers.get('user-agent');

  // Strict validation: IP must match
  if (session.createdIP !== currentIP) {
    logger.security('Session IP mismatch', {
      sessionId,
      expected: session.createdIP,
      actual: currentIP
    });
    return null;
  }

  // Soft validation: UA should match (log if different)
  if (session.userAgent !== currentUA) {
    logger.warn('Session User-Agent changed', {
      sessionId,
      expected: session.userAgent.substring(0, 50),
      actual: currentUA?.substring(0, 50)
    });
  }

  return session;
}
```

---

## API Security

### Endpoint Protection Matrix

**Location**: `src/lib/middleware/auth.ts`

| Endpoint Pattern | Protection | Auth Required | Rate Limit | Methods |
|-----------------|------------|---------------|------------|---------|
| `/api/auth/*` | `auth` | ❌ No | 5/min | POST |
| `/api/webauthn/*` | `webauthn` | ❌ No | 15/min | GET, POST |
| `/api/lightning/*` | `financial` | ✅ Yes | 10/5min | GET, POST |
| `/api/bitcoin/*` | `financial` | ✅ Yes | 10/5min | GET, POST |
| `/api/avnu/*` | `protected` | ✅ Yes | 100/min | POST |
| `/api/rpc/*` | `rpc` | ❌ No | 50/min | POST |
| `/api/user/*` | `protected` | ✅ Yes | 100/min | GET, PUT |
| `/api/pricing/*` | `public` | ❌ No | 200/min | GET |
| `/api/health` | `public` | ❌ No | 200/min | GET |
| `/api/debug/*` | `protected` | ✅ Yes | 100/min | GET, POST |

### Unmapped Endpoints (SEC_REVIEW Finding #9)

**Problem**: Some endpoints not explicitly mapped, rely on default protection

**Current Behavior**:
```typescript
// Unmapped endpoints default to 'protected'
const applyEndpointProtection = (event: RequestEvent) => {
  const protection = ENDPOINT_PROTECTION[event.url.pathname] || 'protected';
  // ...
};
```

**Missing from Map**:
- `/api/lightning/verify-swap-state/[id]`
- `/api/lightning/wait-claim-confirmation/[id]`
- `/api/lightning/wait-commit-confirmation/[id]`
- `/api/atomiq/limits`

**Remediation**:

```typescript
export const ENDPOINT_PROTECTION: Record<string, keyof typeof authMiddleware> = {
  // ... existing mappings ...

  // Lightning swap endpoints
  '/api/lightning/verify-swap-state': 'protected',
  '/api/lightning/wait-claim-confirmation': 'protected',
  '/api/lightning/wait-commit-confirmation': 'protected',

  // Atomiq endpoints
  '/api/atomiq/limits': 'public',

  // Add test to ensure all routes are mapped (see below)
};
```

**Automated Verification**:

```typescript
// tests/security/endpoint-protection.test.ts
import { describe, it, expect } from 'vitest';
import { ENDPOINT_PROTECTION } from '$lib/middleware/auth';
import * as fs from 'fs';
import * as path from 'path';

describe('Endpoint Protection Coverage', () => {
  it('all API routes should be explicitly protected', () => {
    const routesDir = path.join(process.cwd(), 'src/routes/api');
    const allRoutes: string[] = [];

    // Recursively find all +server.ts files
    function findRoutes(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          findRoutes(fullPath);
        } else if (entry.name === '+server.ts') {
          // Convert file path to API path
          const apiPath = fullPath
            .replace(routesDir, '')
            .replace('/+server.ts', '')
            .replace(/\[([^\]]+)\]/g, ':$1') // [id] -> :id
            .replace(/\\/g, '/'); // Windows paths

          allRoutes.push(`/api${apiPath}`);
        }
      }
    }

    findRoutes(routesDir);

    // Check each route has protection
    const unmappedRoutes = allRoutes.filter(route => {
      const pattern = route.replace(/:[\w]+/g, '[^/]+'); // :id -> [^/]+
      return !Object.keys(ENDPOINT_PROTECTION).some(key =>
        new RegExp(`^${pattern}$`).test(key)
      );
    });

    expect(unmappedRoutes).toEqual([]);
  });
});
```

### CORS Configuration

**Location**: `src/hooks.server.ts:223-234`

```typescript
// CORS for API routes
if (event.url.pathname.startsWith('/api/')) {
  response.headers.set('Access-Control-Allow-Origin', event.url.origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Internal-Key');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '600');
}
```

✅ **Secure Configuration**:
- Same-origin only (`event.url.origin`)
- Credentials allowed (for cookie-based auth)
- Reasonable preflight cache (10 minutes)

❌ **Potential Issue**:
- Allows `X-Internal-Key` header in CORS
- If used for authentication, this could be problematic

**Recommendation**:
```typescript
// Only allow X-Internal-Key from same origin
const allowedHeaders = ['Content-Type', 'Authorization'];

if (event.url.origin === EXPECTED_ORIGIN) {
  allowedHeaders.push('X-Internal-Key');
}

response.headers.set(
  'Access-Control-Allow-Headers',
  allowedHeaders.join(', ')
);
```

---

## Rate Limiting & DDoS Protection

### Current Implementation

**Location**: `src/lib/utils/network/rate-limit.ts`

```typescript
class RateLimiter {
  private ipStore = new Map<string, RateLimitEntry>();
  private userStore = new Map<string, RateLimitEntry>();

  check(
    identifier: string,
    limit: number,
    windowMs: number,
    type: 'ip' | 'user'
  ): RateLimitResult {
    const store = type === 'ip' ? this.ipStore : this.userStore;
    const now = Date.now();

    const entry = store.get(identifier) || {
      count: 0,
      resetTime: now + windowMs,
      blockUntil: 0
    };

    // Progressive penalty
    if (entry.blockUntil > now) {
      return { allowed: false, retryAfter: entry.blockUntil - now };
    }

    if (now > entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }

    entry.count++;

    if (entry.count > limit) {
      // Exponential backoff
      entry.blockUntil = now + (windowMs * Math.pow(2, entry.violations));
      entry.violations = (entry.violations || 0) + 1;

      return { allowed: false, retryAfter: entry.blockUntil - now };
    }

    store.set(identifier, entry);
    return { allowed: true };
  }
}
```

### Issues (SEC_REVIEW Finding #7)

**Problem 1: In-Memory Only**
- Not shared across multiple server instances
- Lost on server restart
- Each instance has separate limits

**Problem 2: NAT/Proxy Bypass**
- Multiple users behind same NAT share IP limit
- Proxy/VPN users can bypass by switching IPs

**Problem 3: No Distributed State**
- Cannot enforce global rate limits
- Difficult to detect distributed attacks

### Remediation

**Upgrade to Redis-Based Rate Limiting**:

```typescript
// lib/utils/network/redis-rate-limit.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate:${identifier}`;

  // Use Redis pipeline for atomic operations
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();
  const count = results![0][1] as number;

  if (count > limit) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: limit - count };
}

// Multi-tier rate limiting
export async function checkMultiTierRateLimit(
  ip: string,
  userId: string | null,
  endpoint: string
): Promise<RateLimitResult> {
  const checks = [
    // IP-based (prevent IP flooding)
    checkRateLimit(`ip:${ip}`, 1000, 60), // 1000/min per IP

    // User-based (if authenticated)
    userId ? checkRateLimit(`user:${userId}`, 100, 60) : null, // 100/min per user

    // Endpoint-specific
    checkRateLimit(`endpoint:${endpoint}:${ip}`, 50, 60) // 50/min per IP per endpoint
  ];

  const results = await Promise.all(checks.filter(Boolean));

  // All checks must pass
  for (const result of results) {
    if (!result!.allowed) {
      return { allowed: false, retryAfter: 60 };
    }
  }

  return { allowed: true };
}
```

**Deployment Configuration**:

```bash
# Railway: Add Redis service
railway add redis

# Update environment
REDIS_URL=redis://...
```

**Timeline**: HIGH priority, should be done before significant traffic

---

## Input Validation

### Validation Middleware

**Location**: `src/lib/middleware/validation.ts`

```typescript
export const validationSchemas = {
  // Lightning swap
  createLightningSwap: {
    amountSats: {
      required: true,
      type: 'number',
      min: 1000,        // 1000 sats minimum
      max: 100000000    // 1 BTC maximum
    },
    destinationAsset: {
      required: true,
      type: 'string',
      enum: ['WBTC']
    },
    starknetAddress: {
      required: true,
      type: 'string',
      pattern: /^0x[a-fA-F0-9]{63,64}$/,
      sanitize: true
    }
  },

  // Starknet address
  starknetAddress: {
    required: true,
    type: 'string',
    pattern: /^0x[a-fA-F0-9]{1,64}$/,
    sanitize: true,
    transform: (val: string) => val.toLowerCase()
  },

  // Lightning invoice
  lightningInvoice: {
    required: true,
    type: 'string',
    pattern: /^(lnbc|lntb)[a-z0-9]+$/i,
    maxLength: 1000,
    sanitize: true
  },

  // Bitcoin address
  bitcoinAddress: {
    required: true,
    type: 'string',
    pattern: /^(bc1|tb1)[a-z0-9]{39,87}$/i,  // Bech32
    sanitize: true
  }
};
```

### Type-Specific Sanitization

```typescript
export function sanitizeStarknetAddress(address: string): string {
  // Remove whitespace
  address = address.trim();

  // Normalize case
  address = address.toLowerCase();

  // Validate format
  if (!/ ^0x[a-f0-9]{1,64}$/.test(address)) {
    throw new Error('Invalid Starknet address format');
  }

  // Pad to 66 characters (0x + 64 hex)
  return '0x' + address.slice(2).padStart(64, '0');
}

export function sanitizeLightningInvoice(invoice: string): string {
  // Remove whitespace
  invoice = invoice.trim();

  // Decode and validate
  try {
    const decoded = decodeLightningInvoice(invoice);

    // Check expiry
    if (decoded.timeExpireDate < Date.now() / 1000) {
      throw new Error('Invoice expired');
    }

    return invoice;
  } catch (error) {
    throw new Error('Invalid Lightning invoice');
  }
}

export function sanitizeAmount(amount: number, asset: string): number {
  // Validate range
  const limits = {
    WBTC: { min: 1000, max: 100000000 }  // 1000 sats - 1 BTC
  };

  const { min, max } = limits[asset as keyof typeof limits];

  if (amount < min || amount > max) {
    throw new Error(`Amount must be between ${min} and ${max} sats`);
  }

  // Round to integer (no fractional sats)
  return Math.floor(amount);
}
```

### Injection Prevention

✅ **SQL Injection**: Protected by Drizzle ORM (parameterized queries)
✅ **XSS**: CSP headers + input sanitization
✅ **Command Injection**: No shell execution with user input
⚠️ **NoSQL Injection**: N/A (using PostgreSQL, not MongoDB)

### Unexpected Field Detection

```typescript
// Detect potential injection attempts
export function validateRequest(data: any, schema: any): ValidationResult {
  const allowedFields = Object.keys(schema);
  const providedFields = Object.keys(data);

  const unexpectedFields = providedFields.filter(
    field => !allowedFields.includes(field)
  );

  if (unexpectedFields.length > 0) {
    logger.security('Unexpected fields in request', {
      endpoint: event.url.pathname,
      unexpectedFields,
      ip: getClientAddress()
    });

    // Strict mode: reject request
    throw error(400, 'Invalid request fields');

    // Permissive mode: log warning and continue
    // (Current behavior - less secure)
  }

  // Validate each field
  // ...
}
```

---

## Cryptographic Operations

### WebAuthn Signature Verification

**Location**: `src/lib/utils/webauthn/server-verification.ts`

**Current Implementation** (Custom):

```typescript
import { p256 as secp256r1 } from '@noble/curves/p256';

export async function verifyWebAuthnAssertion({
  signature,
  authenticatorData,
  clientDataJSON,
  publicKey
}: {
  signature: string;
  authenticatorData: string;
  clientDataJSON: string;
  publicKey: string;
}): Promise<{ verified: boolean }> {
  // 1. Parse ASN.1 signature
  const { r, s } = parseASN1Signature(hex2buf(signature));

  // 2. Create message hash
  const message = createMessageHash(
    hex2buf(authenticatorData),
    hex2buf(clientDataJSON)
  );

  // 3. Recover public key from x-coordinate
  const xCoord = base64url2buf(publicKey);
  const fullPublicKey = recoverPublicKey(xCoord);

  // 4. Verify ECDSA signature
  const verified = secp256r1.verify(
    { r, s },
    message,
    fullPublicKey
  );

  return { verified };
}
```

**Security Assessment** (from SEC_REVIEW.md line 128):

> "Custom approach handles ECDSA r/s parsing and tries to recover pubkey from x coordinate. This is **brittle and error-prone**. A standard library reduces risk and ensures correct checks."

**Problems**:

1. **Public Key Recovery from X-Coordinate**
   - Assumes y-coordinate recovery is reliable
   - No validation of recovered point on curve
   - Could accept invalid public keys

2. **Missing Validation**
   - No clientDataJSON.type check ("webauthn.get")
   - No origin validation
   - No RP ID hash validation
   - No authenticator flags validation

3. **No Replay Protection**
   - Sign counter not checked
   - Challenge not validated

**Remediation**: See Critical Vulnerability #1 (Use SimpleWebAuthn)

### Cryptographic Best Practices

✅ **Good Practices in Use**:
- Using `@noble/curves` (audited library)
- SHA-256 for hashing
- No weak algorithms (MD5, SHA-1)

❌ **Missing**:
- Cryptographic nonce management
- Key rotation procedures
- Hardware security module (HSM) integration

### Secrets Management

**Current Approach**: Environment variables

**Location**: `.env` file (not committed to git ✅)

**Secrets in Use**:
```bash
DATABASE_URL=postgresql://...
SESSION_SECRET=abc123...
PUBLIC_DEPLOYER_PRIVATE_KEY=0x...
WEBHOOK_SECRET=xyz789...
STARKNET_RPC_URL=https://...
INTERNAL_API_KEY=...
```

**Security Concerns**:

1. **No Secret Rotation**
   - Secrets never changed
   - If leaked, remain valid forever

2. **No Secret Scanning**
   - No pre-commit hooks to detect accidental commits
   - No GitHub secret scanning

3. **No Access Control**
   - Anyone with server access can read all secrets

**Recommendations**:

```bash
# Install secret scanner
npm install --save-dev @secretlint/secretlint-rule-preset-recommend

# Add pre-commit hook
# .husky/pre-commit
npx secretlint "**/*"
```

**Production Secret Management**:

```typescript
// Option 1: Railway Secret Management (Current)
// ✅ Secrets stored in Railway dashboard
// ✅ Not visible in logs
// ⚠️ No rotation policy

// Option 2: HashiCorp Vault
import vault from 'node-vault';

const client = vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
});

const secrets = await client.read('secret/data/bim-bim');

// Option 3: AWS Secrets Manager
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManager({
  region: 'us-east-1'
});

const secret = await secretsManager.getSecretValue({
  SecretId: 'bim-bim/production'
});
```

---

## Operational Security

### Database Security

**Current Configuration**:

```typescript
// Connection pool
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
  max: 20,  // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

export const db = drizzle(pool);
```

✅ **Security Features**:
- SSL connections in production
- Connection pooling (prevents connection exhaustion)
- Parameterized queries (Drizzle ORM)
- Automatic escaping

❌ **Missing**:
- No encryption at rest (database-level)
- No read replicas (performance/availability)
- No query logging for audit trail
- No connection string rotation

**Database User Permissions**:

```sql
-- Current: Using default postgres user (❌ Too permissive)

-- Should be: Minimal permissions
CREATE USER bim_app WITH PASSWORD 'secure_password';

-- Grant only necessary permissions
GRANT CONNECT ON DATABASE webauthn_db TO bim_app;
GRANT USAGE ON SCHEMA public TO bim_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bim_app;

-- Revoke dangerous permissions
REVOKE CREATE ON SCHEMA public FROM bim_app;
REVOKE DROP ON ALL TABLES IN SCHEMA public FROM bim_app;
```

### Backup & Recovery

**Current Status**: Railway automatic backups (provider-managed)

**Recommendation**:

```bash
# Automated backup script
#!/bin/bash
# scripts/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${DATE}.sql"

pg_dump $DATABASE_URL > $BACKUP_FILE

# Encrypt backup
gpg --encrypt --recipient backups@example.com $BACKUP_FILE

# Upload to S3
aws s3 cp ${BACKUP_FILE}.gpg s3://bim-bim-backups/

# Cleanup
rm $BACKUP_FILE ${BACKUP_FILE}.gpg

echo "Backup complete: $BACKUP_FILE"
```

**Recovery Plan**:

```bash
# 1. Download latest backup
aws s3 cp s3://bim-bim-backups/backup_latest.sql.gpg .

# 2. Decrypt
gpg --decrypt backup_latest.sql.gpg > backup.sql

# 3. Restore
psql $DATABASE_URL < backup.sql

# 4. Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

### Logging & Monitoring

**Current Logging**:

**Location**: `src/lib/utils/logger.ts`

```typescript
class Logger {
  request(method: string, path: string, context: any) {
    console.log(JSON.stringify({
      level: 'info',
      type: 'request',
      method,
      path,
      ...context
    }));
  }

  security(message: string, context: any, severity: string) {
    console.log(JSON.stringify({
      level: severity || 'warning',
      type: 'security',
      message,
      ...context
    }));
  }

  error(message: string, error: Error, context: any) {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error.message,
      stack: error.stack,
      ...context
    }));
  }
}
```

✅ **Good Practices**:
- Structured logging (JSON)
- Contextual information
- Separate security event logging

⚠️ **Verbose Logging Issue** (SEC_REVIEW Finding #8):

**Location**: Multiple files log sensitive data

```typescript
// PROBLEM: Logging credential IDs, public keys, signatures
logger.info('WebAuthn assertion', {
  credentialId: assertion.credentialId,  // ❌ Sensitive
  signature: assertion.signature.substring(0, 20),  // ❌ Sensitive
  publicKey: user.publicKey  // ❌ Sensitive
});

// SHOULD BE:
logger.info('WebAuthn assertion attempt', {
  userId: user.id,
  credentialIdHash: sha256(assertion.credentialId).substring(0, 16),
  signatureLength: assertion.signature.length
});
```

**Log Redaction Utility**:

```typescript
// lib/utils/log-redaction.ts
const SENSITIVE_FIELDS = [
  'credentialId',
  'publicKey',
  'signature',
  'privateKey',
  'password',
  'secret',
  'token',
  'apiKey'
];

export function redactSensitiveData(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const redacted = { ...data };

  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redactSensitiveData(redacted[key]);
    }
  }

  return redacted;
}

// Usage
logger.info('WebAuthn assertion', redactSensitiveData(context));
```

**Security Event Monitoring**:

```typescript
// Define security events to monitor
const SECURITY_EVENTS = {
  AUTH_FAILURE: 'authentication_failed',
  RATE_LIMIT: 'rate_limit_exceeded',
  INVALID_INPUT: 'invalid_input_detected',
  SESSION_HIJACK: 'session_hijack_attempt',
  WEBHOOK_VERIFY_FAIL: 'webhook_verification_failed',
  DEBUG_ACCESS: 'debug_endpoint_accessed'
};

// Alert on critical events
export function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  context: any
) {
  logger.security(event, redactSensitiveData(context), severity);

  // Send alert for high/critical severity
  if (severity === 'high' || severity === 'critical') {
    // Send to monitoring system (e.g., Sentry, PagerDuty)
    sendAlert(event, context);
  }
}
```

**Recommendation**: Integrate with external monitoring:
- **Sentry**: Error tracking and performance monitoring
- **Datadog**: Infrastructure and APM monitoring
- **PagerDuty**: Alert management and on-call rotation

### Content Security Policy (CSP)

**Current CSP** (SEC_REVIEW Finding #5):

**Location**: `src/lib/utils/security.ts`

```typescript
export function generateCSP(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // ❌ Too permissive
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://starknet-mainnet.public.blastapi.io",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}
```

**Problems**:

1. **`unsafe-inline` in script-src**
   - Allows inline `<script>` tags
   - Defeats XSS protection

2. **`unsafe-eval` in script-src**
   - Allows `eval()`, `new Function()`
   - Dangerous for user input

**Remediation**:

```typescript
// Option 1: Nonce-based CSP (RECOMMENDED for SvelteKit)
export function generateCSP(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,  // ✅ Only scripts with nonce
    "style-src 'self' 'unsafe-inline'",    // Styles can remain inline (lower risk)
    "img-src 'self' data: blob:",
    "connect-src 'self' https://starknet-mainnet.public.blastapi.io",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"  // ✅ Prevent embedding
  ].join('; ');
}

// Generate nonce per request
export const handle: Handle = async ({ event, resolve }) => {
  const nonce = generateNonce();
  event.locals.nonce = nonce;

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      return html.replace('%sveltekit.nonce%', nonce);
    }
  });

  response.headers.set('Content-Security-Policy', generateCSP(nonce));

  return response;
};

// In HTML
<script nonce="%sveltekit.nonce%">
  // Your inline script
</script>
```

**Option 2: External Scripts Only**

```typescript
// Move all inline scripts to external files
// src/lib/client/init.ts
export function initializeApp() {
  // Initialization logic
}

// In +layout.svelte
<script>
  import { initializeApp } from '$lib/client/init';
  initializeApp();
</script>
```

**CSP Reporting**:

```typescript
// Add report-uri to CSP
export function generateCSP(nonce: string): string {
  return [
    // ... policies ...
    "report-uri /api/csp-report"
  ].join('; ');
}

// Endpoint to receive reports
export async function POST({ request }) {
  const report = await request.json();

  logger.security('CSP violation', {
    documentUri: report['csp-report']['document-uri'],
    violatedDirective: report['csp-report']['violated-directive'],
    blockedUri: report['csp-report']['blocked-uri']
  });

  return new Response(null, { status: 204 });
}
```

---

## Security Development Lifecycle

### Pre-Commit Checks

**Current Setup**: Husky pre-commit hooks

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run type-check
npm run lint
npm run test
```

**Add Security Checks**:

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Type checking
npm run type-check

# Code formatting
npm run lint

# Security checks
npm audit --audit-level=moderate
npm run test:security

# Secret scanning
npx secretlint "**/*"

# Dependency vulnerability scan
npx snyk test
```

### CI/CD Pipeline Security

**Recommendation**: Add security checks to GitHub Actions

```yaml
# .github/workflows/security.yml
name: Security Scan

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Audit dependencies
        run: npm audit --audit-level=high

      - name: Run security tests
        run: npm run test:security

      - name: SAST scan
        uses: github/codeql-action/init@v2
        with:
          languages: typescript

      - name: Build application
        run: npm run build

      - name: CodeQL analysis
        uses: github/codeql-action/analyze@v2

      - name: Dependency check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'BIM-BIM'
          path: '.'
          format: 'ALL'

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: security-scan-results
          path: dependency-check-report.*
```

### Security Testing

**Create Security Test Suite**:

```typescript
// tests/security/auth.test.ts
import { describe, it, expect } from 'vitest';

describe('Authentication Security', () => {
  it('should reject invalid WebAuthn signatures', async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        signature: 'invalid',
        authenticatorData: 'invalid',
        clientDataJSON: 'invalid'
      })
    });

    expect(response.status).toBe(401);
  });

  it('should enforce rate limits on login endpoint', async () => {
    const requests = Array(10).fill(null).map(() =>
      fetch('/api/auth/login', { method: 'POST' })
    );

    const responses = await Promise.all(requests);
    const tooManyRequests = responses.filter(r => r.status === 429);

    expect(tooManyRequests.length).toBeGreaterThan(0);
  });

  it('should not leak timing information on invalid username', async () => {
    const start1 = Date.now();
    await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'valid_user' })
    });
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'invalid_user' })
    });
    const time2 = Date.now() - start2;

    // Timing should be similar (within 100ms)
    expect(Math.abs(time1 - time2)).toBeLessThan(100);
  });
});

// tests/security/injection.test.ts
describe('Injection Prevention', () => {
  it('should prevent SQL injection in username', async () => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: "'; DROP TABLE users; --"
      })
    });

    expect(response.status).toBe(400);

    // Verify users table still exists
    const users = await db.select().from(users).limit(1);
    expect(users).toBeDefined();
  });

  it('should sanitize XSS attempts in input', async () => {
    const xssPayload = '<script>alert("XSS")</script>';

    const response = await fetch('/api/user/settings', {
      method: 'PUT',
      body: JSON.stringify({
        displayName: xssPayload
      })
    });

    // Should either reject or sanitize
    const data = await response.json();
    expect(data.displayName).not.toContain('<script>');
  });
});
```

### Penetration Testing Checklist

**Before Production Launch**:

- [ ] Automated vulnerability scan (OWASP ZAP, Burp Suite)
- [ ] Manual security review of authentication flows
- [ ] API fuzzing testing
- [ ] CSRF protection verification
- [ ] Session management testing
- [ ] Rate limiting effectiveness testing
- [ ] Error message information leakage check
- [ ] Third-party dependency audit
- [ ] Infrastructure security review (Railway configuration)
- [ ] Secrets management audit

---

## Incident Response

### Security Incident Classification

| Severity | Definition | Response Time | Examples |
|----------|-----------|---------------|----------|
| **P0 - Critical** | Active breach, data loss imminent | Immediate | Database exposed, admin access compromised |
| **P1 - High** | Vulnerability being exploited | 1 hour | Unauthorized access attempts, DDoS attack |
| **P2 - Medium** | Potential vulnerability discovered | 24 hours | Vulnerable dependency, misconfiguration |
| **P3 - Low** | Security hygiene issue | 1 week | Outdated documentation, unused endpoints |

### Incident Response Playbook

#### 1. Detection Phase

**Monitoring Alerts**:
```typescript
// Set up alerts for:
- Multiple failed authentication attempts (> 10/min)
- Unusual database queries
- High error rates (> 5% of requests)
- Rate limit violations (> 100/min from single IP)
- Debug endpoint access in production
- Webhook verification failures
```

#### 2. Containment Phase

**Immediate Actions**:

```bash
# 1. Isolate affected systems
railway down  # Stop affected service

# 2. Revoke compromised credentials
railway env set SESSION_SECRET=new_secret_value
railway env set WEBHOOK_SECRET=new_webhook_secret

# 3. Block malicious IPs (if applicable)
# Add to rate limiter or firewall

# 4. Preserve evidence
railway logs > incident_$(date +%Y%m%d_%H%M%S).log
```

#### 3. Eradication Phase

**Fix Vulnerabilities**:

```typescript
// Example: Emergency patch for authentication bypass
// 1. Deploy hotfix
git checkout -b hotfix/auth-bypass
// ... make fixes ...
git commit -m "Security: Fix authentication bypass (EMERGENCY)"
git push origin hotfix/auth-bypass

// 2. Fast-track review and deploy
railway up

// 3. Verify fix
curl -X POST https://app.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"malicious": "payload"}'

// Should return 401, not 200
```

#### 4. Recovery Phase

**Restore Services**:

```bash
# 1. Verify database integrity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# 2. Restore from backup if needed
# (see Backup & Recovery section)

# 3. Restart services
railway up

# 4. Monitor for abnormalities
railway logs --tail=100 --follow
```

#### 5. Post-Incident Phase

**Documentation**:

```markdown
# Incident Report: [TITLE]

## Incident Summary
- **Date**: 2026-01-15
- **Severity**: P1 (High)
- **Duration**: 2 hours
- **Impact**: 150 users affected

## Timeline
- 14:00 UTC: Anomalous traffic detected
- 14:05 UTC: Incident declared
- 14:10 UTC: Service isolated
- 14:30 UTC: Vulnerability patched
- 15:45 UTC: Service restored
- 16:00 UTC: Monitoring resumed

## Root Cause
[Detailed explanation]

## Actions Taken
1. [Action 1]
2. [Action 2]

## Lessons Learned
- What went well
- What could be improved

## Follow-Up Actions
- [ ] Update security documentation
- [ ] Implement additional monitoring
- [ ] Conduct security training
```

### Contact Information

**Security Team**:
- Security Lead: [Email]
- DevOps: [Email]
- On-Call: [PagerDuty / Phone]

**External Resources**:
- **Starknet Security**: security@starknet.io
- **Atomiq Support**: support@atomiq.com
- **Railway Support**: support@railway.app

---

## Compliance & Best Practices

### OWASP Top 10 (2021) Compliance

| Risk | Status | Notes |
|------|--------|-------|
| **A01: Broken Access Control** | ⚠️ Partial | Endpoint protection exists, but gaps in RPC proxy |
| **A02: Cryptographic Failures** | ⚠️ Partial | Custom WebAuthn crypto needs review |
| **A03: Injection** | ✅ Protected | Drizzle ORM prevents SQL injection |
| **A04: Insecure Design** | ⚠️ Partial | Debug endpoints in production |
| **A05: Security Misconfiguration** | ⚠️ Partial | CSP too permissive, secrets in env vars |
| **A06: Vulnerable Components** | ✅ Monitored | npm audit run regularly |
| **A07: Identification & Auth** | ❌ Vulnerable | WebAuthn ceremony incomplete |
| **A08: Software & Data Integrity** | ⚠️ Partial | Webhook verification broken |
| **A09: Logging & Monitoring** | ⚠️ Partial | Logging exists but verbose |
| **A10: SSRF** | ✅ Protected | RPC URL allowlist in place |

### Security Checklist for Production

#### Phase 1: Critical (MUST FIX)

- [ ] Fix WebAuthn ceremony (use SimpleWebAuthn)
- [ ] Disable or restrict debug endpoints
- [ ] Require authentication for RPC proxy OR add Redis rate limiting
- [ ] Fix webhook signature verification (raw body + constant-time compare)

#### Phase 2: High Priority

- [ ] Tighten CSP (remove unsafe-inline, unsafe-eval)
- [ ] Implement Redis-based rate limiting
- [ ] Add endpoint protection test (all routes mapped)
- [ ] Reduce auth-related logging verbosity
- [ ] Clear expired session cookies

#### Phase 3: Medium Priority

- [ ] Implement secret rotation procedures
- [ ] Add security event monitoring/alerting
- [ ] Database user permission restrictions
- [ ] Implement automated backups
- [ ] Add penetration testing to CI/CD

#### Phase 4: Long-Term

- [ ] Implement role-based access control (RBAC)
- [ ] Add Web Application Firewall (WAF)
- [ ] Implement hardware security module (HSM) for key storage
- [ ] Add intrusion detection system (IDS)
- [ ] SOC 2 compliance assessment

---

## Quick Reference: Security Commands

```bash
# Security audit
npm audit --audit-level=moderate

# Fix auto-fixable vulnerabilities
npm audit fix

# Run security tests
npm run test:security

# Check for secrets in code
npx secretlint "**/*"

# Generate security report
npm run security:report

# Database backup
./scripts/backup-db.sh

# View security logs
railway logs | grep "security"

# Emergency: Rotate secrets
railway env set SESSION_SECRET=$(openssl rand -hex 32)
railway env set WEBHOOK_SECRET=$(openssl rand -hex 32)

# Emergency: Disable debug endpoints
railway env set NODE_ENV=production
```

---

## Additional Resources

- [OWASP WebAuthn Guide](https://cheatsheetseries.owasp.org/cheatsheets/WebAuthn_Cheat_Sheet.html)
- [SimpleWebAuthn Docs](https://simplewebauthn.dev/docs/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Railway Security](https://docs.railway.app/reference/security)
- [Starknet Security Best Practices](https://docs.starknet.io/documentation/security/)

---

**For security concerns, contact**: [Your Security Email]

**Last Security Review**: 2025-09-03 (see SEC_REVIEW.md)

**Next Scheduled Review**: 2026-03-01
