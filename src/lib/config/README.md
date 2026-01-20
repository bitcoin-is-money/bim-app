# Centralized Configuration System

A unified configuration management system that consolidates scattered configuration files, environment variables, and constants into a single, type-safe, and well-validated system.

## 🎯 Overview

This configuration system addresses the **scattered configuration issue** by providing:

- **Single source of truth** for all configuration
- **Type-safe** environment variable access
- **Comprehensive validation** for configuration values
- **Service-specific factories** with intelligent defaults
- **Environment-aware** configuration with overrides
- **Circuit breaker presets** for different services
- **Migration utilities** to help transition from old patterns

## 📁 File Structure

```
src/lib/config/
├── index.ts                 # Main configuration manager and exports
├── env.ts                   # Environment variable utilities
├── validators.ts            # Validation utilities and schemas
├── circuit-breaker.ts       # Circuit breaker configuration management
├── migration-guide.ts       # Migration helpers and examples
├── avnu.config.ts          # Updated AVNU configuration (example)
├── avnu-server.config.ts   # Updated AVNU server configuration (example)
└── README.md               # This documentation
```

## 🚀 Quick Start

### Basic Environment Variables

```typescript
import { PublicEnv, PrivateEnv } from '$lib/config/env';

// Public variables (client-safe)
const rpcUrl = PublicEnv.STARKNET_RPC_URL();
const chainId = PublicEnv.STARKNET_CHAIN_ID();
const debugMode = PublicEnv.ENABLE_DEBUG_MODE();

// Private variables (server-side only)
const dbUrl = PrivateEnv.DATABASE_URL();
const sessionSecret = PrivateEnv.SESSION_SECRET();
const apiKey = PrivateEnv.AVNU_API_KEY();
```

### Service Configuration

```typescript
import { serviceConfig } from '$lib/config';

// Get complete service configurations
const starknetConfig = serviceConfig.getStarknetConfig();
const webauthnConfig = serviceConfig.getWebAuthnConfig();
const databaseConfig = serviceConfig.getDatabaseConfig();
const monitoringConfig = serviceConfig.getMonitoringConfig();
```

### Timeout Management

```typescript
import { TimeoutConfig } from '$lib/config';

// Hierarchical timeout access
const webauthnTimeout = TimeoutConfig.WEBAUTHN.CREATE;
const apiTimeout = TimeoutConfig.API.REQUEST;
const dbTimeout = TimeoutConfig.DATABASE.CONNECTION;

// Environment-based timeout overrides
const customTimeout = TimeoutConfig.getTimeout('API', 'REQUEST', 30_000);
```

### Circuit Breaker Configuration

```typescript
import { CircuitBreakerConfigs } from '$lib/config/circuit-breaker';

// Pre-configured circuit breakers
const lightningCB = CircuitBreakerConfigs.lightning();
const apiCB = CircuitBreakerConfigs.api();
const databaseCB = CircuitBreakerConfigs.database();

// Custom circuit breaker
const customCB = CircuitBreakerConfigs.builder('my-service')
  .withFailureThreshold(3)
  .withRecoveryTimeout(15_000)
  .withSuccessThreshold(2)
  .build();
```

### Configuration Validation

```typescript
import { configValidator, ConfigValidators } from '$lib/config';

// System-wide validation
const validation = configValidator.validateAll();
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}

// Individual validations
const isValidUrl = ConfigValidators.isValidUrl('https://example.com');
const isValidAddress = ConfigValidators.isValidStarknetAddress('0x123...');
const isValidTimeout = ConfigValidators.isValidTimeoutMs(30000);
```

## 📚 API Reference

### Environment Variable Access

#### PublicEnv

Public environment variables that are safe to expose to the client:

```typescript
PublicEnv.STARKNET_RPC_URL()           // Starknet RPC endpoint
PublicEnv.STARKNET_CHAIN_ID()          // Starknet chain ID
PublicEnv.WEBAUTHN_RP_ID()             // WebAuthn relying party ID
PublicEnv.BITCOIN_NETWORK()            // Bitcoin network (mainnet/testnet)
PublicEnv.get(key, fallback?)          // Generic getter
PublicEnv.getRequired(key)             // Required getter (throws if missing)
PublicEnv.getNumber(key, fallback?)    // Number getter with validation
PublicEnv.getBoolean(key, fallback?)   // Boolean getter
PublicEnv.getUrl(key, fallback?)       // URL getter with validation
```

#### PrivateEnv

Private environment variables for server-side use only:

```typescript
PrivateEnv.DATABASE_URL()              // Database connection string
PrivateEnv.SESSION_SECRET()            // Session encryption secret
PrivateEnv.AVNU_API_KEY()              // AVNU API key
PrivateEnv.get(key, fallback?)         // Generic getter
PrivateEnv.getRequired(key)            // Required getter (throws if missing)
PrivateEnv.getNumber(key, fallback?)   // Number getter with validation
PrivateEnv.getBoolean(key, fallback?)  // Boolean getter
PrivateEnv.getUrl(key, fallback?)      // URL getter with validation
```

### Service Configuration Factory

#### serviceConfig Methods

```typescript
serviceConfig.getStarknetConfig(); // Starknet RPC, chain ID, contracts
serviceConfig.getWebAuthnConfig(); // WebAuthn RP settings, timeouts
serviceConfig.getDatabaseConfig(); // Database URL, connection limits
serviceConfig.getMonitoringConfig(); // Sentry, metrics, sampling rates
serviceConfig.getSecurityConfig(); // Session settings
serviceConfig.getLightningConfig(); // Bitcoin network, Atomiq settings
serviceConfig.getAvnuConfig(); // AVNU paymaster configuration
serviceConfig.getAvnuServerConfig(); // AVNU server-side configuration
```

### Timeout Configuration

#### TimeoutConfig Structure

```typescript
TimeoutConfig.WEBAUTHN.CREATE; // WebAuthn credential creation
TimeoutConfig.WEBAUTHN.GET; // WebAuthn credential retrieval
TimeoutConfig.API.REQUEST; // General API requests
TimeoutConfig.API.POLLING_INTERVAL; // Polling frequency
TimeoutConfig.API.LONG_POLLING; // Long polling interval
TimeoutConfig.DATABASE.CONNECTION; // Database connection timeout
TimeoutConfig.DATABASE.QUERY; // Database query timeout
TimeoutConfig.DATABASE.IDLE; // Database idle timeout
TimeoutConfig.CIRCUIT_BREAKER.TIMEOUT; // Circuit breaker timeout
TimeoutConfig.CIRCUIT_BREAKER.RECOVERY; // Circuit breaker recovery
TimeoutConfig.SESSION.MAX_AGE; // Session maximum age
TimeoutConfig.SESSION.REFRESH_THRESHOLD; // Session refresh threshold
TimeoutConfig.UPLOAD.TIMEOUT; // File upload timeout
```

#### Dynamic Timeout Access

```typescript
// Get timeout with environment override
TimeoutConfig.getTimeout(category, key, fallback);

// Examples:
TimeoutConfig.getTimeout('API', 'REQUEST', 30000);
TimeoutConfig.getTimeout('WEBAUTHN', 'CREATE', 120000);
```

### Circuit Breaker Configurations

#### Pre-configured Services

```typescript
CircuitBreakerConfigs.lightning(); // Lightning Network operations
CircuitBreakerConfigs.api(); // External API calls
CircuitBreakerConfigs.pricing(); // Pricing service calls
CircuitBreakerConfigs.webhook(); // Webhook operations
CircuitBreakerConfigs.database(); // Database operations
CircuitBreakerConfigs.cache(); // Cache operations
CircuitBreakerConfigs.payment(); // Payment provider calls
CircuitBreakerConfigs.realtime(); // Real-time services
```

#### Custom Configuration Patterns

```typescript
// Common patterns
CircuitBreakerConfigs.custom.fastRecovery(name)
CircuitBreakerConfigs.custom.conservative(name)
CircuitBreakerConfigs.custom.httpApi(name, statusCodes?)
CircuitBreakerConfigs.custom.exponentialBackoff(name, maxBackoff?)

// Builder pattern
CircuitBreakerConfigs.builder(name)
  .withFailureThreshold(3)
  .withRecoveryTimeout(15000)
  .withSuccessThreshold(2)
  .withFailureDetection(customStrategy)
  .build()
```

### Configuration Validation

#### ConfigValidators Methods

```typescript
// URL and Address Validation
ConfigValidators.isValidUrl(url)                    // HTTP/HTTPS URLs
ConfigValidators.isValidStarknetAddress(address)    // Starknet addresses
ConfigValidators.isValidEthereumAddress(address)    // Ethereum addresses
ConfigValidators.isValidBitcoinAddress(address)     // Bitcoin addresses

// Security Validation
ConfigValidators.isValidApiKey(apiKey)              // API key format
ConfigValidators.isValidDatabaseUrl(url)            // Database URL format

// Network and Service Validation
ConfigValidators.isValidChainId(chainId)            // Blockchain chain IDs
ConfigValidators.isValidPort(port)                  // Port numbers
ConfigValidators.isValidBitcoinNetwork(network)     // Bitcoin network names
ConfigValidators.isValidRpId(rpId)                  // WebAuthn RP IDs
ConfigValidators.isValidEnvironment(env)            // Environment names

// Data Validation
ConfigValidators.isValidTimeoutMs(timeout)          // Timeout values
ConfigValidators.isValidJson(jsonString)            // JSON format
ConfigValidators.isValidFileSize(size, maxSize?)    // File sizes
ConfigValidators.isValidMimeType(type, allowed?)    // MIME types
ConfigValidators.isValidPercentage(value)           // Percentage values
ConfigValidators.isValidRateLimit(window, max)      // Rate limit config

// Comprehensive Validation
ConfigValidators.validateServiceConfig(config)      // Service configuration
ConfigValidators.validateEnvironmentRequirements(env, config) // Environment-specific
```

#### System-wide Validation

```typescript
import { configValidator } from '$lib/config';

const validation = configValidator.validateAll();
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
  process.exit(1);
}
```

### Environment Validation

#### EnvValidation Utilities

```typescript
import { EnvValidation } from '$lib/config/env';

// Environment Detection
EnvValidation.getEnvironment(); // 'development' | 'staging' | 'production'
EnvValidation.isDevelopment(); // boolean
EnvValidation.isProduction(); // boolean

// Validation
EnvValidation.validateProduction(); // Production-specific validation
EnvValidation.validateUrls(); // URL format validation
```

## 🔧 Environment Variables

### Required Public Variables

```bash
PUBLIC_STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io
PUBLIC_BITCOIN_NETWORK=testnet
```

### Required Production Variables

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/database
SESSION_SECRET=your-session-secret-at-least-32-characters
```

### Optional Variables

```bash
# WebAuthn Configuration
PUBLIC_WEBAUTHN_RP_ID=localhost
PUBLIC_WEBAUTHN_RP_NAME="BIM3 WebAuthn Wallet"
PUBLIC_BIM_ARGENT_050_ACCOUNT_CLASS_HASH=0x...

# Third-party Services
AVNU_API_KEY=your-avnu-api-key
PUBLIC_SENTRY_DSN=https://...
PUBLIC_ENABLE_SENTRY=true

# Feature Flags
PUBLIC_ENABLE_ANALYTICS=false
PUBLIC_ENABLE_DEBUG_MODE=false

# Timeout Overrides (in milliseconds)
TIMEOUT_API_REQUEST=30000
TIMEOUT_WEBAUTHN_CREATE=120000
TIMEOUT_DATABASE_CONNECTION=30000

# Circuit Breaker Overrides
CIRCUIT_BREAKER_API_FAILURE_THRESHOLD=3
CIRCUIT_BREAKER_API_RECOVERY_TIMEOUT=10000
CIRCUIT_BREAKER_LIGHTNING_FAILURE_THRESHOLD=5
```

## 🏗️ Migration Guide

### From Scattered Configuration

The migration guide provides step-by-step instructions and utilities to help migrate from the old scattered configuration pattern to the new centralized system.

```typescript
import {
  ConfigMigrationHelper,
  MigrationExamples,
} from '$lib/config/migration-guide';

// Get migration checklist for your service
const checklist = ConfigMigrationHelper.generateMigrationChecklist('MyService');

// View before/after examples
console.log(MigrationExamples.environmentAccess);
console.log(MigrationExamples.serviceConfiguration);
```

### Step-by-Step Migration

1. **Replace Environment Variable Access**

   ```typescript
   // Before
   import { env } from '$env/dynamic/public';
   const rpcUrl = env.PUBLIC_STARKNET_RPC_URL || 'fallback';

   // After
   import { PublicEnv } from '$lib/config/env';
   const rpcUrl = PublicEnv.STARKNET_RPC_URL();
   ```

2. **Replace Service Configuration**

   ```typescript
   // Before
   const config = {
     rpcUrl: env.PUBLIC_STARKNET_RPC_URL,
     chainId: env.PUBLIC_STARKNET_CHAIN_ID,
     // ... manual configuration
   };

   // After
   import { serviceConfig } from '$lib/config';
   const config = serviceConfig.getStarknetConfig();
   ```

3. **Replace Validation Logic**

   ```typescript
   // Before
   function isValidUrl(url: string): boolean {
     try {
       new URL(url);
       return true;
     } catch {
       return false;
     }
   }

   // After
   import { ConfigValidators } from '$lib/config/validators';
   const isValidUrl = ConfigValidators.isValidUrl;
   ```

4. **Add Configuration Validation**

   ```typescript
   import { configValidator } from '$lib/config';

   // Validate on service startup
   const validation = configValidator.validateAll();
   if (!validation.valid) {
     throw new Error(
       `Configuration validation failed: ${validation.errors.join(', ')}`
     );
   }
   ```

## 🧪 Testing

### Configuration Testing Utilities

```typescript
import { serviceConfig, configValidator, PublicEnv } from '$lib/config';
import { describe, it, expect } from 'vitest';

describe('Service Configuration', () => {
  it('should have valid Starknet configuration', () => {
    const config = serviceConfig.getStarknetConfig();
    expect(config.RPC_URL).toBeDefined();
    expect(config.CHAIN_ID).toBeDefined();
  });

  it('should validate all configuration', () => {
    const validation = configValidator.validateAll();
    expect(validation.valid).toBe(true);
  });

  it('should provide environment variables', () => {
    const rpcUrl = PublicEnv.STARKNET_RPC_URL();
    expect(rpcUrl).toBeDefined();
    expect(rpcUrl).toMatch(/^https?:\/\//);
  });
});
```

## 🐛 Troubleshooting

### Common Issues

1. **Configuration Validation Fails**
   - Check that all required environment variables are set
   - Verify URL formats and network names
   - Ensure secrets meet minimum security requirements

2. **Environment Variables Not Found**
   - Verify `.env` file is properly loaded
   - Check that PUBLIC\_ prefix is used for client-side variables
   - Ensure no PUBLIC\_ prefix for server-side secrets

3. **Circuit Breaker Not Working**
   - Verify service name matches predefined configurations
   - Check environment overrides are properly formatted
   - Ensure circuit breaker is properly initialized

4. **Migration Issues**
   - Use migration guide examples for reference
   - Update imports to use new paths
   - Remove old configuration files after migration

### Debug Mode

Enable debug mode to see detailed configuration information:

```bash
PUBLIC_ENABLE_DEBUG_MODE=true
```

## 📈 Performance Considerations

- Configuration is cached after first access
- Environment variable parsing is optimized
- Validation is performed once at startup
- Circuit breaker configurations are pre-compiled

## 🔒 Security Notes

- Never put secrets in PUBLIC\_ environment variables
- Database URLs should use SSL in production
- API keys should be rotated regularly

---

**Migration Status**: ✅ **Completed**

- Scattered configuration consolidated into centralized system
- Environment variable handling unified with validation
- Service configuration factories created with type safety
- Circuit breaker configurations optimized and consolidated
- Comprehensive validation and testing utilities provided
