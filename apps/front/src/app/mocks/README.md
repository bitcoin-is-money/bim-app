# Mock Backend for Development

This directory contains a mock backend implementation using Angular HTTP interceptors. It simulates the WebAuthn authentication flow entirely in the browser, allowing frontend development without a running backend server.

## Overview

The mock backend is **enabled by default in development mode** (`ng serve`) and **disabled in production builds** (`ng build`).

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  Angular App                                                     │
│                                                                  │
│  AuthService ──HTTP──▶ MockBackendInterceptor ──▶ MockAuthHandler│
│                              │                          │        │
│                              │                          ▼        │
│                              │                   MockDataStore   │
│                              │                   (LocalStorage)  │
│                              │                                   │
│                              └── (in prod) ──▶ Real Backend      │
└─────────────────────────────────────────────────────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `mock-backend.interceptor.ts` | HTTP interceptor that routes `/api/*` requests to mock handlers |
| `mock-auth.handler.ts` | WebAuthn authentication simulation (challenges, credentials) |
| `mock-data.store.ts` | LocalStorage-based persistence for credentials and sessions |
| `index.ts` | Barrel export |

## WebAuthn Challenge Flow

WebAuthn uses a challenge-response protocol to prevent replay attacks:

### Registration (Sign Up)

```
1. Client ──POST /api/auth/register/begin──▶ Server
   { username: "alice" }

2. Server generates:
   - Random challenge (32 bytes, base64 encoded)
   - Unique challengeId (UUID)
   - User ID (UUID)
   Stores pending challenge with expiration (60s)

3. Server ◀── Response ── Client
   { challengeId, options: { challenge, rpId, userId, userName, ... } }

4. Client calls navigator.credentials.create({ publicKey: options })
   - Browser prompts user for biometric/PIN
   - Creates new credential (public/private key pair)
   - Returns attestation with signed challenge

5. Client ──POST /api/auth/register/complete──▶ Server
   { challengeId, username, credential: { id, attestationObject, ... } }

6. Server:
   - Validates challengeId exists and not expired
   - Stores credential (id, publicKey, userId)
   - Creates session
   - Returns account info
```

### Authentication (Sign In)

```
1. Client ──POST /api/auth/login/begin──▶ Server
   { username: "alice" }

2. Server:
   - Finds stored credential for username
   - Generates new random challenge
   - Returns allowCredentials (list of valid credential IDs)

3. Client calls navigator.credentials.get({ publicKey: options })
   - Browser prompts user for biometric/PIN
   - Signs challenge with private key

4. Client ──POST /api/auth/login/complete──▶ Server
   { challengeId, credential: { id, signature, authenticatorData, ... } }

5. Server:
   - Validates challengeId and credential
   - In real server: verifies signature with stored public key
   - In mock: trusts credential existence
   - Creates session
```

## Mock Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register/begin` | Start registration, returns challenge |
| POST | `/api/auth/register/complete` | Complete registration, stores credential |
| POST | `/api/auth/login/begin` | Start login, returns challenge |
| POST | `/api/auth/login/complete` | Complete login, validates credential |
| GET | `/api/auth/session` | Get current session |
| POST | `/api/auth/logout` | Clear session |

## Error Simulation

The mock simulates these error cases:

| HTTP Status | Error | Trigger |
|-------------|-------|---------|
| 409 | User already exists | Sign up with existing username |
| 404 | User not found | Sign in with unknown username |
| 400 | Invalid or expired challenge | Tampered or timed-out challenge |
| 401 | Invalid credential | Credential ID not found |

## Data Persistence

Credentials and sessions persist in LocalStorage:

| Key | Content |
|-----|---------|
| `mock_credentials` | Map of credentialId → { publicKey, userId, username, counter } |
| `mock_pending_challenges` | Map of challengeId → { challenge, type, expiresAt } |
| `mock_current_session` | Current user account or null |

To clear all mock data, run in browser console:
```javascript
localStorage.removeItem('mock_credentials');
localStorage.removeItem('mock_pending_challenges');
localStorage.removeItem('mock_current_session');
```

## Testing with Chrome/Chromium DevTools

On desktop Linux/Windows without biometric hardware, you need a **virtual authenticator**:

### Setup Virtual Authenticator

1. Open DevTools (`F12` or `Ctrl+Shift+I`)
2. Open Command Palette (`Ctrl+Shift+P`)
3. Type **"WebAuthn"** and select **"Enable Virtual Authenticator Environment"**
4. A **WebAuthn** panel appears at the bottom of DevTools
5. Click **"Add"** to create a virtual authenticator:

   | Setting | Value |
   |---------|-------|
   | Protocol | `ctap2` |
   | Transport | `internal` |
   | Supports resident keys | ✓ (checked) |
   | Supports user verification | ✓ (checked) |

6. The virtual authenticator is now active

### Testing the Flow

1. Start dev server: `npm run dev:front`
2. Open `http://localhost:4200`
3. Open DevTools and enable virtual authenticator (steps above)
4. **Sign Up**: Enter username (min 3 chars), click "Sign Up"
   - Virtual authenticator auto-responds (no prompt)
   - Check DevTools console for `[MockBackend]` logs
5. **Sign In**: Enter same username, click "Sign In"
   - Uses stored credential from registration

### Debugging

Watch the console for mock backend logs:
```
[MockBackend] POST /api/auth/register/begin { body: {...}, response: {...} }
[MockBackend] POST /api/auth/register/complete { body: {...}, response: {...} }
```

Check stored credentials in DevTools:
- Application tab → Local Storage → `http://localhost:4200`
- Look for `mock_credentials`, `mock_current_session`

## Development vs Production

| Mode | Mock Backend | Authenticator |
|------|--------------|---------------|
| Development (`ng serve`) | Enabled | Any (virtual or hardware) |
| Production (`ng build`) | Disabled | Platform only (TouchID, FaceID, fingerprint) |

This is controlled by `environment.ts` / `environment.development.ts` and the `fileReplacements` in `angular.json`.

## Extending the Mock

To add new mock endpoints:

1. Add handler method in `mock-auth.handler.ts` (or create new handler)
2. Add route matching in `mock-backend.interceptor.ts`
3. Update types if needed

Example:
```typescript
// mock-auth.handler.ts
deleteAccount(userId: string): HttpResponse<void> {
  this.store.deleteCredentialByUserId(userId);
  this.store.setSession(null);
  return new HttpResponse({ status: 204 });
}

// mock-backend.interceptor.ts
if (url.match(/\/api\/auth\/account\/\w+/) && method === 'DELETE') {
  const userId = url.split('/').pop()!;
  response = mockAuthHandler.deleteAccount(userId);
}
```
