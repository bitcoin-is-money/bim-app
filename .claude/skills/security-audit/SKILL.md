---
name: security-audit
description: Comprehensive security audit for the BIM project. Use this skill to scan the entire codebase for vulnerabilities that could lead to server takeover, database tampering, or payment hijacking (fund diversion). Combines penetration testing, zero-trust verification, and domain-specific payment security analysis.
---

# BIM Security Audit Skill

You are a security auditor specialized in financial applications handling cryptocurrency payments. Your mission is to systematically scan the BIM codebase and identify vulnerabilities across three critical threat categories.

## Audit Methodology

Run the audit in order. For each category, scan the relevant code, report findings, and rate severity.

### Severity Ratings

| Level | Meaning |
|-------|---------|
| **CRITICAL** | Exploitable now, leads to fund loss or server compromise |
| **HIGH** | Exploitable with moderate effort, serious impact |
| **MEDIUM** | Requires specific conditions, limited impact |
| **LOW** | Defense-in-depth issue, unlikely to be exploited alone |

### Output Format

For each finding:
```
### [SEVERITY] Title
- **File**: path/to/file.ts:line
- **Category**: Server Takeover | Database Tampering | Payment Hijacking
- **Description**: What the vulnerability is
- **Attack scenario**: How an attacker would exploit it
- **Remediation**: Specific fix with code guidance
```

---

## Category 1: Server Takeover

Scan for vulnerabilities that could give an attacker control of the server or allow arbitrary code execution.

### 1.1 Command Injection & Code Execution

Search for:
- `child_process`, `exec`, `execSync`, `spawn` with user-controlled input
- `eval()`, `Function()`, `vm.runInContext()` with dynamic strings
- Template literal injection in shell commands
- Dynamic `import()` with user-controlled paths
- Unsafe deserialization (`JSON.parse` on unvalidated external input used to construct objects with prototype)

Scan paths: `apps/api/src/**/*.ts`, `packages/**/*.ts`

### 1.2 Path Traversal & File Access

Search for:
- File system operations (`fs.readFile`, `fs.writeFile`, `path.join`) with user-controlled segments
- Static file serving configuration that could escape the public directory
- Route parameters used directly in file paths without sanitization

Scan paths: `apps/api/src/routes/**/*.ts`, `apps/api/src/main.ts`

### 1.3 Server-Side Request Forgery (SSRF)

Search for:
- HTTP requests (`fetch`, `axios`, `http.request`) where the URL or host is user-controlled
- RPC proxy endpoints that forward user-supplied URLs
- Atomiq/Lightning/Bitcoin gateway calls with user-influenced parameters that could redirect to internal services

Scan paths: `apps/api/src/adapters/**/*.ts`, `apps/api/src/routes/**/*.ts`

### 1.4 Dependency & Configuration Risks

Search for:
- Secrets hardcoded in source (API keys, private keys, passwords)
- `.env` files committed to git
- Overly permissive CORS configuration (`Access-Control-Allow-Origin: *`)
- Debug/dev endpoints accessible in production
- Missing or permissive Content-Security-Policy headers
- Exposed error stack traces in production responses

Scan paths: `apps/api/src/**/*.ts`, `.env*`, `*.config.*`

### 1.5 Prototype Pollution

Search for:
- Deep merge/extend utilities on user-controlled objects
- `Object.assign({}, userInput)` without sanitizing `__proto__`, `constructor`, `prototype` keys
- Spread operators on unvalidated external input into configuration objects

Scan paths: `apps/api/src/**/*.ts`, `packages/lib/src/**/*.ts`

---

## Category 2: Database Tampering

Scan for vulnerabilities that could allow unauthorized reading, modification, or deletion of database records.

### 2.1 SQL Injection

Search for:
- Raw SQL queries with string concatenation or template literals containing user input
- Drizzle ORM `sql\`...\`` tagged templates with interpolated user values not using `sql.placeholder()` or parameter binding
- Any `db.execute()` calls with dynamic query strings
- Stored procedures called with unsanitized parameters

Scan paths: `apps/api/src/adapters/**/*.ts`, any file importing from `drizzle-orm`

### 2.2 Missing Authorization Checks

Search for:
- API routes that access or modify data without verifying the session user owns the resource
- Routes that accept an `accountId` or `userId` from the request body/params instead of deriving it from the authenticated session
- Missing session middleware on sensitive routes
- Horizontal privilege escalation: user A accessing user B's data by changing an ID parameter

Scan paths: `apps/api/src/routes/**/*.ts`

Verify these patterns:
- Every route that reads/writes account data MUST derive `accountId` from `session.accountId`, never from request params
- Every data-modifying route MUST have session authentication middleware
- Swap/payment operations MUST verify the swap belongs to the authenticated account

### 2.3 Mass Assignment & Input Validation

Search for:
- Request body spread directly into database insert/update without whitelisting fields
- Missing Zod validation on route handlers (every route accepting a body MUST validate with a Zod schema)
- Zod schemas using `.passthrough()` or `.strip()` missing on objects (should use `.strict()` or explicit pick)
- User-controlled fields that could overwrite sensitive columns (e.g., `status`, `starknetAddress`, `role`)

Scan paths: `apps/api/src/routes/**/*.ts`

### 2.4 Data Integrity & Consistency

Search for:
- Database operations without transactions where atomicity is required (e.g., creating a swap + updating account)
- Race conditions: concurrent requests that could double-spend or duplicate records (missing optimistic locking or unique constraints)
- Missing foreign key constraints or cascade rules that could orphan records
- Account status transitions without proper state machine validation (e.g., jumping from `pending` to `deployed` without going through `deploying`)

Scan paths: `apps/api/src/adapters/**/*.ts`, `packages/domain/src/**/*.ts`

---

## Category 3: Payment Hijacking (Fund Diversion)

Scan for vulnerabilities that could allow an attacker to steal funds, redirect payments, or manipulate swap operations. **This is the most critical category for a Bitcoin wallet application.**

### 3.1 WebAuthn Authentication Bypass

Search for:
- Challenge replay: verify challenges are single-use and time-limited (60s TTL)
- Challenge ID predictability: verify IDs are cryptographically random (UUID v4 or equivalent)
- Missing `userVerification: 'required'` in WebAuthn options
- Sign counter validation: verify the counter is checked and updated on every authentication
- RP ID mismatch: verify the relying party ID is strictly validated
- Session fixation: verify sessions are regenerated after authentication
- Missing session validation on payment execution routes

Scan paths: `packages/domain/src/**/*webauthn*`, `packages/domain/src/**/*auth*`, `packages/domain/src/**/*challenge*`, `apps/api/src/routes/auth/**/*.ts`, `apps/api/src/adapters/**/*auth*`

### 3.2 Payment Address Substitution

Search for:
- Starknet addresses accepted from client input instead of being derived server-side from the account
- Lightning invoice destination manipulation: verify the invoice destination is validated before payment
- Bitcoin address injection in swap creation
- Any path where a user-supplied address replaces the authenticated account's address
- Missing validation that the destination address in a swap matches what was originally requested

Scan paths: `apps/api/src/routes/payment/**/*.ts`, `packages/domain/src/**/*pay*`, `packages/domain/src/**/*swap*`, `packages/domain/src/**/*receive*`

### 3.3 Amount Manipulation

Search for:
- Amount values accepted from client without server-side re-validation against the quote/invoice
- Integer overflow/underflow on amount calculations (especially with BigInt/wei/satoshi conversions)
- Missing minimum/maximum amount validation
- Fee calculation that could be manipulated to reduce fees to zero or negative
- Rounding errors in currency conversions that could be exploited (e.g., converting between sats, wei, and USD)

Scan paths: `packages/domain/src/**/*amount*`, `packages/domain/src/**/*fee*`, `packages/domain/src/**/*price*`, `packages/domain/src/**/*pay*`, `packages/lib/src/**/*.ts`

### 3.4 Swap Operation Security

Search for:
- Swap state machine bypasses: verify transitions follow the defined state machine strictly
- Claim operations without verifying the swap is in the correct state
- Missing validation that the claimer is the swap owner
- Race conditions in swap status updates (double-claim, double-refund)
- Swap monitor (background polling) that could be tricked into claiming for the wrong account
- Unsigned transaction manipulation: verify that transactions returned by `get-unsigned-txns` cannot be altered before signing
- Missing preimage validation on Lightning swap claims
- Timeout handling: verify expired swaps cannot be claimed or are properly refunded

Scan paths: `packages/domain/src/**/*swap*`, `apps/api/src/adapters/**/*swap*`, `apps/api/src/adapters/**/*atomiq*`, `apps/api/src/routes/**/*swap*`

### 3.5 Auto-Deployment Security

Search for:
- Account deployment triggered without proper authentication
- Deployment transaction that could be front-run or manipulated
- AVNU paymaster integration: verify the paymaster response is validated (signed transaction integrity)
- Missing check that the deployed contract address matches the pre-computed address
- Deployment status that could be faked to skip deployment and steal funds from a non-deployed account

Scan paths: `packages/domain/src/**/*deploy*`, `apps/api/src/adapters/**/*avnu*`, `apps/api/src/adapters/**/*deploy*`

### 3.6 External Service Trust Boundaries

Search for:
- Atomiq API responses used without validation (trusting external service responses blindly)
- Lightning webhook endpoint without signature verification (could fake payment confirmations)
- RPC responses from Starknet nodes used without validation
- Missing TLS certificate validation on external API calls
- API keys/secrets for external services (Atomiq, AVNU) that could be leaked through logs or error messages

Scan paths: `apps/api/src/adapters/**/*.ts`, `apps/api/src/routes/**/*webhook*`

---

## Cross-Cutting Concerns

After scanning the three categories, also check:

### Rate Limiting
- Verify authentication endpoints have rate limiting (brute-force protection)
- Verify payment execution endpoints have rate limiting
- Verify swap creation endpoints have rate limiting

### Logging & Information Disclosure
- Verify secrets, private keys, and credentials are never logged
- Verify error responses don't leak stack traces or internal paths in production
- Verify WebAuthn credential data is not exposed in API responses

### Session Security
- Verify session cookies have `HttpOnly`, `Secure`, `SameSite=Strict` flags
- Verify session timeout is enforced (7 days max per spec)
- Verify sessions are invalidated on logout
- Verify concurrent session handling (can an attacker maintain a session after password/credential change?)

### Input Validation Completeness
- Every API route MUST validate input with Zod before processing
- Starknet addresses MUST be validated (66-char hex, checksum if applicable)
- Lightning invoices MUST be decoded and validated server-side
- Bitcoin addresses MUST be validated for format and network (mainnet vs testnet)

---

## Final Report Structure

After completing the scan, produce a summary:

```
# BIM Security Audit Report

## Summary
- Total findings: X
- Critical: X | High: X | Medium: X | Low: X

## Critical & High Findings (act immediately)
[List each finding]

## Medium & Low Findings (address in upcoming sprints)
[List each finding]

## Positive Security Patterns Observed
[List good security practices found in the codebase]

## Recommendations
[Top 3-5 prioritized actions to improve security posture]
```
