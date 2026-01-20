Security Review – BIM3 (SvelteKit + Node adapter)

Last updated: 2025-09-03

Scope: SvelteKit app and server routes under src/routes, Lightning/Bitcoin swap services, Atomiq SDK integration, WebAuthn auth, Drizzle ORM/Postgres, pricing service.


Executive Summary

- Overall posture: Good baseline hardening (security headers, input validators, rate limiting) but several critical authentication and operational control issues must be addressed before production exposure.
- Highest risks:
  1) WebAuthn registration/login flows do not implement the formal ceremony (no server challenge/origin/RP validation) → account takeover/replay feasible (Critical).
  2) Debug endpoints (e.g., DB reset) are deployable and only “protected” by generic session auth → any authenticated user can reset DB (Critical).
  3) RPC proxy is unauthenticated (by design) and exposes your private RPC quota to the world (High). While method-allowlisting reduces blast radius, abuse and cost leakage remain.
  4) Webhook signature verification uses JSON.stringify(payload) instead of raw body, and non-constant-time comparisons (High). This can break verification or allow subtle bypasses.
- Additional concerns: overly permissive CSP (unsafe-inline/eval), verbose logging of auth materials, weak rate limiting (in-memory only), cookie/session details, inconsistent endpoint protection mapping.


Methodology

- Reviewed server hooks, auth/session, WebAuthn verification, API routes for lightning/bitcoin/rpc, webhook, pricing endpoints, DB schema/Drizzle usage, security headers/CSP, and debug/admin utilities.
- Focused on auth flows, input validation, secrets exposure, CORS/CSP, SSRF, signature verification, rate limiting/DoS, logging/PII, and operational “footguns”.


Top Findings (Prioritized)

1) WebAuthn ceremony is incomplete (Critical)
- Impact: An attacker can craft assertions that verify with the stored public key without server-managed challenge or origin validation, enabling replay/cross-origin attacks and account takeover.
- Evidence:
  - Registration trusts client-provided credentialId/publicKey without attestation: src/routes/api/auth/register/+server.ts
  - Login verifies signature but does not validate server-issued challenge, origin, RP ID, sign counter, flags: src/routes/api/auth/login/+server.ts and src/lib/utils/webauthn/server-verification.ts
- Recommendation:
  - Adopt a well-vetted library like SimpleWebAuthn. Implement standard flows:
    - Register: generate challenge server-side; send PublicKeyCredentialCreationOptions; verify attestation (or at least clientDataJSON.origin and rpId), persist credential ID, public key, counter.
    - Login: generate challenge server-side; verify assertion: clientDataJSON.challenge, type, origin, rpIdHash, authenticatorData flags, signature against stored publicKey; enforce and update sign counter (anti-replay).
  - Store per-session, expiring challenges (e.g., Redis or DB) and check expiry (~60s) and single-use.
  - Reduce sensitive logging in these paths.

2) Debug reset endpoint is deployable and only requires auth (Critical)
- Impact: Any authenticated user can wipe users table (DoS/data loss).
- Evidence: src/routes/api/debug/reset-db/+server.ts (no env guard, no role/owner checks).
- Recommendation:
  - Disable debug routes in production (NODE_ENV check) or remove from build.
  - If needed, restrict by admin role + signed internal key + IP allowlist; log and alert on usage.

3) RPC proxy unauthenticated; private RPC key usage exposed (High)
- Impact: Third parties can consume your Starknet RPC quota and cause cost/availability issues, even if methods are allowlisted.
- Evidence: src/lib/middleware/auth.ts maps /api/rpc* to authMiddleware.rpc which sets requireAuth: false; endpoints in src/routes/api/rpc/+server.ts and src/routes/api/rpc-call/+server.ts.
- Recommendation:
  - Require session auth or enforce an internal API key (header) with strict rate limiting. Consider per-user quotas. If public access is desired, increase allow-list strictness, add strong rate limiting using Redis, and add CAPTCHA for abuse endpoints.

4) Webhook signature verification correctness/timing (High)
- Impact: Signature checks can fail unexpectedly or be bypassed by JSON canonicalization differences; timing-attackable comparisons.
- Evidence: src/lib/services/server/webhook/signature-verifier.service.ts re-stringifies parsed JSON (JSON.stringify(payload)) and compares hex directly.
- Recommendation:
  - Compute HMAC over the raw request body bytes as received (await request.text()) and compare using a constant-time equality (e.g., crypto.timingSafeEqual on Node Buffers). Reject if header missing or timestamp too old (replay window).

5) CSP allows 'unsafe-inline' and 'unsafe-eval' (Medium)
- Impact: Increased XSS surface; defeats CSP’s primary value.
- Evidence: generateCSP() in src/lib/utils/security.ts
- Recommendation:
  - For production, switch to 'script-src' with nonces or hashes. Remove 'unsafe-eval' and minimize 'unsafe-inline'. Use SvelteKit’s CSP support where possible and migrate inline scripts.

6) Session/cookie nuances (Medium)
- Impact: Cookie handling is mostly good but can be hardened; SESSION_SECRET appears unused.
- Evidence: src/lib/auth/session.ts uses UUIDs persisted in DB; secure: env.SECURE_COOKIES != 'false'; SameSite: 'strict'; no domain; comment notes cookie not cleared on expired session.
- Recommendation:
  - Clear cookie on expired sessions (server hook on validateSession failure). Consider '__Host-' prefix, Secure always in production, and short maxAge for sensitive ops. If SESSION_SECRET is intended, either use for signed/encrypted cookies or remove it.

7) Rate limiting is in-memory (Medium)
- Impact: Ineffective across multiple instances; reset on restart; easy to bypass behind NAT/CDN.
- Evidence: src/lib/utils/network/rate-limit.ts and custom per-endpoint stores (rpc endpoints).
- Recommendation:
  - Move to Redis/memcached and enforce IP+user-based buckets. Add distinct budgets per sensitive endpoint (auth, financial, rpc).

8) Verbose logging of auth material (Low/Medium)
- Impact: Logs contain previews/lengths of credential IDs, signatures, and public keys; could be sensitive in aggregate.
- Evidence: src/routes/api/auth/login/+server.ts, src/lib/utils/webauthn/server-verification.ts, avnu endpoints.
- Recommendation:
  - Add a log redaction utility; gate verbose auth debug behind a feature flag; never log full values; drop lengths and previews in production.

9) Endpoint protection mapping drift (Low)
- Impact: Some lightning endpoints not explicitly in ENDPOINT_PROTECTION; they default to 'protected' via applyEndpointProtection, which may be correct but increases configuration risk.
- Evidence: src/lib/middleware/auth.ts mapping vs routes like /api/lightning/create-invoice, /api/lightning/verify-swap-state, etc.
- Recommendation:
  - Enumerate all API endpoints in ENDPOINT_PROTECTION with intended policies; add tests to fail builds if routes are unmapped.

10) Migration endpoint operational risk (Low)
- Impact: /api/migrate protected only by MIGRATION_SECRET; still a footgun if exposed.
- Evidence: src/routes/api/migrate/+server.ts
- Recommendation:
  - Limit to development or protect behind admin auth + IP allowlist; ensure secret rotation and audit logs.


Positive Controls Observed

- Security headers and CORS added in hooks: HSTS, X-Frame-Options DENY, X-Content-Type-Options, Permissions-Policy, COEP/COOP/CORP. CORS for API reflects same-origin and credentials correctly in hooks.server.ts.
- RPC server service allowlists methods and validates addresses/tx hashes (src/lib/services/server/rpc.service.ts).
- Input validators and consistent API error handling utils (src/lib/services/shared/api-response/*, validators.ts); Lightning/Bitcoin endpoints validate amounts and addresses.
- Drizzle ORM with typed schema; joins built with eq/inArray; reduced SQL injection risk.
- WebAuthn debug endpoint explicitly disabled in production (src/routes/api/debug/webauthn/+server.ts).
- CSP connect-src curated to expected origins; private RPC URL is not leaked to CSP.


Recommended Remediations (Action Plan)

Phase 1 – Blockers (Critical/High)
- WebAuthn: Implement proper register/login ceremonies with server-side challenge tracking, origin/RP validation, counter enforcement, spec-compliant signature verification. Consider SimpleWebAuthn. Add anti-replay storage for challenges.
- Debug routes: Guard all /api/debug/* with NODE_ENV !== 'production' or delete from build; if required, restrict to admins + IP allowlist.
- RPC proxy: Require session auth OR internal API key; add Redis-backed rate limiting and quotas. Optionally restrict by referrer/fingerprint or remove endpoints not strictly needed.
- Webhook HMAC: Verify against raw body; use timing-safe compare; add timestamp headers + replay window; return 401 on failure without leaking details.

Phase 2 – Hardening (Medium)
- CSP: Remove 'unsafe-eval' and minimize 'unsafe-inline' in production; use nonces/hashes; consider SvelteKit CSP config.
- Cookies: Always set Secure in prod, consider '__Host-session'; clear cookie when sessions expire; evaluate session rotation after login.
- Rate limits: Centralize and move to Redis; set tighter limits for auth, invoice creation, swap endpoints.
- Logging: Add redaction and env-based log levels; strip sensitive fields and numeric lengths.
- Endpoint map: Make ENDPOINT_PROTECTION exhaustive; add route-to-policy test.

Phase 3 – Operational
- Secrets: Document rotation for MIGRATION_SECRET/SESSION_SECRET/API keys; ensure .env handling in CI/CD and scanning for accidental commits. Already .gitignore covers .env.
- Monitoring/alerts: Alert on webhook verification failures, repeated auth failures, RPC spikes, and any debug route access.
- DoS: Review long-polling endpoints and SSE usage; ensure backpressure and caps on open connections.


Notes on Specific Areas

- WebAuthn server verification (src/lib/utils/webauthn/server-verification.ts): Custom approach handles ECDSA r/s parsing and tries to recover pubkey from x coordinate. This is brittle and error-prone. A standard library reduces risk and ensures correct checks (clientDataJSON.type/origin/challenge, rpIdHash, U2F flags, counter).
- Lightning webhook SSE (src/routes/api/lightning/webhook/+server.ts): SSE GET sets Access-Control-Allow-Origin: * without credentials, which is acceptable. Ensure server doesn’t leak sensitive data over public SSE channels (only swapId-scoped, random IDs).
- Pricing: Server-side fetch with optional API key, client fetches via /api/pricing/price; low risk.


Quick Fix Checklist

- Add NODE_ENV guard to all src/routes/api/debug/* and /api/migrate.
- Make /api/rpc* require auth or an internal API key; add Redis rate limiting.
- Replace webhook signature verification with raw-body HMAC + timingSafeEqual.
- Integrate SimpleWebAuthn (or equivalent) for register/login. Store and verify challenges; validate origin/RP ID; enforce sign counter.
- Tighten CSP for production; remove unsafe-eval; use nonces/hashes.
- Always set Secure cookies in prod; clear expired session cookies; consider __Host- prefix.
- Add route policy tests and ensure ENDPOINT_PROTECTION covers all routes.
- Reduce auth-related logging; add redaction helpers.


Appendix: Files Reviewed (non-exhaustive)

- hooks/security: src/hooks.server.ts, src/lib/utils/security.ts
- Auth/session: src/lib/auth/session.ts, src/routes/api/auth/*
- WebAuthn verification: src/lib/utils/webauthn/server-verification.ts
- RPC: src/lib/services/server/rpc.service.ts, src/routes/api/rpc/*, src/lib/middleware/auth.ts
- Lightning/Bitcoin: src/routes/api/lightning/*, src/lib/services/server/lightning.service.ts, src/lib/services/server/webhook/*, src/routes/api/bitcoin/*
- Pricing: src/routes/api/pricing/price/+server.ts, client pricing orchestrator
- DB/schema: src/lib/db/*, drizzle/*
- Debug/admin: src/routes/api/debug/*, src/routes/api/migrate/+server.ts, src/routes/api/admin/*

