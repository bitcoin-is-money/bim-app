# Service Naming Refactor Summary

> **Date**: 2026-01-13
> **Author**: Claude Code
> **Purpose**: Eliminate naming conflicts between client and server services

## Overview

This refactor addresses naming inconsistencies that caused import confusion when services with identical names existed in both `client/` and `server/` directories.

## Problem Statement

**Before**:
```typescript
// Confusing: Same filename in different directories
src/lib/services/client/lightning.service.ts
src/lib/services/server/lightning.service.ts

// Import ambiguity
import { LightningService } from '$lib/services/client/lightning.service';
import { LightningService } from '$lib/services/server/lightning.service';
// Both imported as "lightning.service" in IDE autocomplete
```

**Impact**:
- Import errors when developers accidentally used wrong service
- Unclear which service is client vs server in large files
- IntelliSense confusion in IDEs
- Harder code navigation

## Solution

Added explicit `.client.service.ts` and `.server.service.ts` suffixes to distinguish between client-side and server-side services.

**After**:
```typescript
// Clear distinction
src/lib/services/client/lightning.client.service.ts
src/lib/services/server/lightning.server.service.ts

// Unambiguous imports
import { LightningService } from '$lib/services/client/lightning.client.service';
import { ServerLightningService } from '$lib/services/server/lightning.server.service';
```

## Files Renamed

### Client Services (5 files)

| Old Name | New Name | Purpose |
|----------|----------|---------|
| `lightning.service.ts` | `lightning.client.service.ts` | Lightning Network client operations |
| `starknet.service.ts` | `starknet.client.service.ts` | Starknet blockchain client operations |
| `webauthn.service.ts` | `webauthn.client.service.ts` | WebAuthn credential management |
| `avnu.service.ts` | `avnu.client.service.ts` | AVNU integration client |
| `webauthn.service.test.ts` | `webauthn.client.service.test.ts` | WebAuthn service tests |

### Server Services (3 files)

| Old Name | New Name | Purpose |
|----------|----------|---------|
| `lightning.service.ts` | `lightning.server.service.ts` | Lightning Network server operations |
| `starknet.service.ts` | `starknet.server.service.ts` | Starknet blockchain server operations |
| `rpc.service.ts` | `rpc.server.service.ts` | RPC proxy server |

## Import Updates

**Total files modified**: 48 files

### Categories of Changes

1. **Direct Imports** (20 files)
   - Component files importing services
   - Service files importing other services
   - Test files

2. **Index Files** (2 files)
   - `src/lib/services/client/index.ts`
   - `src/lib/services/server/index.ts`

3. **Type Imports** (10 files)
   - TypeScript type imports from renamed services

4. **Relative Imports** (8 files)
   - Services using relative paths (`../service`)

5. **Svelte Components** (8 files)
   - UI components using renamed services

## Migration Guide for Developers

### For Existing Branches

If you have an existing branch, you'll need to update your imports:

```bash
# 1. Pull latest changes from main
git pull origin main

# 2. Run find/replace in your branch
find src -type f \( -name "*.ts" -o -name "*.svelte" \) \
  -exec sed -i '' 's|services/client/lightning\.service|services/client/lightning.client.service|g' {} +

find src -type f \( -name "*.ts" -o -name "*.svelte" \) \
  -exec sed -i '' 's|services/server/lightning\.service|services/server/lightning.server.service|g' {} +

# (Repeat for starknet, webauthn, avnu, rpc)

# 3. Test your changes
npm run type-check
npm run dev
```

### For New Code

When creating new services, follow the naming convention:

```typescript
// ✅ CORRECT: Client-side service
// File: src/lib/services/client/my-feature.client.service.ts
export class MyFeatureClientService {
  // Client-side logic
}

// ✅ CORRECT: Server-side service
// File: src/lib/services/server/my-feature.server.service.ts
export class MyFeatureServerService {
  // Server-side logic
}

// ❌ WRONG: No suffix (causes confusion)
// File: src/lib/services/client/my-feature.service.ts
```

### Import Examples

**Before**:
```typescript
// Ambiguous
import { LightningService } from '$lib/services/client/lightning.service';
import { StarknetService } from '$lib/services/server/starknet.service';
```

**After**:
```typescript
// Clear distinction
import { LightningService } from '$lib/services/client/lightning.client.service';
import { ServerStarknetService } from '$lib/services/server/starknet.server.service';
```

## Benefits

### 1. Improved Code Clarity
- Immediately obvious whether a service is client or server-side
- Reduces mental overhead when reading code

### 2. Better IDE Support
- IntelliSense suggestions are unambiguous
- "Go to definition" navigates to correct file
- Import autocomplete distinguishes services

### 3. Reduced Bugs
- Eliminates accidental imports of wrong service
- Prevents "cannot access server code in client" errors
- Clearer separation of concerns

### 4. Easier Onboarding
- New developers immediately understand service architecture
- Less confusion about import paths
- Consistent naming pattern throughout codebase

### 5. Future-Proof
- Scales better as codebase grows
- Makes refactoring easier
- Supports code splitting and tree-shaking

## Verification

### Type Checking
```bash
npm run type-check
# Should complete without errors
```

### Import Verification
```bash
# Check for any remaining old imports
grep -r "from.*services/client/lightning\.service['\"]" src
grep -r "from.*services/server/lightning\.service['\"]" src
# Should return no results
```

### Git Status
```bash
git status
# Shows:
# - 8 files renamed (R)
# - 40 files modified (M)
# - All changes committed
```

## Backward Compatibility

**Breaking Change**: Yes

This is a **breaking change** for any code that imports these services. However:

- ✅ All imports in the main codebase have been updated
- ✅ All index files have been updated
- ✅ All tests have been updated

**Action Required**: Developers with open branches must update their imports (see Migration Guide above).

## Files Changed Summary

```
Total Files Changed: 48

Renamed (8):
  Client: 5 files
  Server: 3 files

Modified (40):
  Components: 11 files
  Services: 15 files
  Composables: 2 files
  Index files: 2 files
  Tests: 1 file
  Other: 9 files
```

## Testing Checklist

- [x] All renamed files tracked by git
- [x] All imports updated
- [x] Index files updated
- [x] Test files updated
- [x] No remaining old import patterns
- [ ] Type checking passes (requires npm install)
- [ ] Application builds successfully
- [ ] Application runs without errors
- [ ] All tests pass

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Updated to reflect new naming convention
- [COMMON_GOTCHAS.md](./COMMON_GOTCHAS.md) - TODO: Add section on import naming

## Rollback Procedure

If issues are discovered, rollback with:

```bash
git revert HEAD~1  # Revert this commit
# Then manually fix any merge conflicts
```

## Future Recommendations

1. **Enforce naming in linting**: Add ESLint rule to require `.client.service.ts` or `.server.service.ts` suffix
2. **Code generator**: Create script to generate new services with correct naming
3. **Documentation**: Update contribution guide with naming conventions
4. **CI/CD check**: Add GitHub Action to verify naming convention compliance

---

**Questions?** Contact the development team or refer to [ARCHITECTURE.md](./ARCHITECTURE.md) for service organization details.
