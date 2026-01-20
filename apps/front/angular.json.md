# Angular Configuration (`angular.json`)

This document explains the key configurations in `angular.json`, particularly the environment file replacements for development vs production builds.

## File Replacements

The `fileReplacements` configuration allows Angular to swap files at build time based on the build configuration.

### Configuration

```json
{
  "configurations": {
    "production": {
      "fileReplacements": [
        {
          "replace": "src/environments/environment.ts",
          "with": "src/environments/environment.ts"
        }
      ]
    },
    "development": {
      "fileReplacements": [
        {
          "replace": "src/environments/environment.ts",
          "with": "src/environments/environment.development.ts"
        }
      ]
    }
  }
}
```

### How It Works

| Build Command | Configuration | Environment File Used |
|---------------|---------------|----------------------|
| `ng build` | production (default) | `environment.ts` |
| `ng build --configuration=development` | development | `environment.development.ts` |
| `ng serve` | development (default) | `environment.development.ts` |

### Environment Files

**`src/environments/environment.ts`** (Production)
```typescript
export const environment = {
  production: true,
  useMockBackend: false,
};
```

**`src/environments/environment.development.ts`** (Development)
```typescript
export const environment = {
  production: false,
  useMockBackend: true,
};
```

### Usage in Code

Import the environment file in your code:

```typescript
import { environment } from '../environments/environment';

if (environment.useMockBackend) {
  // Mock backend is enabled
}

if (environment.production) {
  // Production mode
}
```

Angular CLI automatically replaces the import with the correct file based on the build configuration.

## Build Configurations

### Production (`ng build`)

- **Optimization**: Enabled (minification, tree-shaking)
- **Source maps**: Disabled
- **Output hashing**: All files hashed for cache busting
- **Budgets**: Enforced (500kB warning, 1MB error for initial bundle)
- **Mock backend**: Disabled

### Development (`ng serve` or `ng build --configuration=development`)

- **Optimization**: Disabled (faster builds)
- **Source maps**: Enabled (debugging)
- **Output hashing**: Disabled
- **Budgets**: Not enforced
- **Mock backend**: Enabled

## Serve Configuration

The `serve` target uses `development` configuration by default:

```json
{
  "serve": {
    "defaultConfiguration": "development"
  }
}
```

This means `ng serve` automatically uses `environment.development.ts`.

## Build Output

| Configuration | Output Path |
|---------------|-------------|
| Production | `target/frontend/browser/` |
| Development | `target/frontend/browser/` |

The output is the same path for both, but production builds are optimized and hashed.

## Adding New Environment Variables

1. Add the variable to both environment files:

   ```typescript
   // environment.ts (production)
   export const environment = {
     production: true,
     useMockBackend: false,
     apiUrl: 'https://api.example.com',  // New variable
   };

   // environment.development.ts
   export const environment = {
     production: false,
     useMockBackend: true,
     apiUrl: 'http://localhost:8080',    // New variable
   };
   ```

2. Use it in your code:

   ```typescript
   import { environment } from '../environments/environment';

   const apiUrl = environment.apiUrl;
   ```

## Related Files

- `src/environments/environment.ts` - Production environment
- `src/environments/environment.development.ts` - Development environment
- `src/app/app.config.ts` - Uses `environment.useMockBackend` to conditionally register mock interceptor
- `src/app/services/auth.service.ts` - Uses `environment.production` to configure authenticator selection
