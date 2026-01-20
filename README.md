# WebAuthn Starknet Account Deployment

A WebAuthn-based Starknet account deployment system that enables users to create and deploy Argent-style smart contract accounts using WebAuthn (passkey/biometric) authentication instead of traditional private keys. Features gasless deployment through AVNU paymaster integration and comprehensive PostgreSQL database for user management.

## Setup for testnet

### Database Setup

1. Install PostgreSQL and create a database:

```bash
createdb webauthn_db
```

2. Copy environment variables and configure database:

```bash
cp .env.example .env
```

3. Fill the values in the `.env` file:
   - Configure your PostgreSQL connection string in `DATABASE_URL`
   - Generate a secure session secret for `SESSION_SECRET`
   - The deployer account needs at least 0.001 ETH to deploy webauthn accounts

### Application Setup

```bash
npm install && npm run db:generate && npm run db:migrate
```

### Development

```bash
npm run dev
```

Open the displayed url in Chrome or Safari.

## **Development Guidelines**

### **Code Quality & Security**

#### **Pre-Development Setup**

```bash
# Install dependencies and set up pre-commit hooks
npm install
# Husky pre-commit hooks are automatically set up via postinstall script

# Run database migrations
npm run db:generate && npm run db:migrate
```

#### **Code Quality Commands**

```bash
# Type checking and linting (run before committing)
npm run type-check          # Full TypeScript type checking with warnings as errors
npm run type-check-quick     # Quick type check without warnings as errors
npm run lint                 # Check code formatting with Prettier
npm run format              # Auto-format code with Prettier

# Testing
npm run test                # Run unit tests
npm run test:ui             # Run tests with UI
npm run test:coverage       # Run tests with coverage report
npm run test:e2e            # Run end-to-end tests
npm run test:e2e:ui         # Run E2E tests with UI

# Production readiness
npm run test:production     # Comprehensive production readiness validation
npm run build              # Production build
npm run validate:env       # Validate environment variables
```

#### **Security Development Practices**

1. **Input Validation**: Always use validation schemas from `src/lib/middleware/validation.ts`
2. **Authentication**: Use authentication middleware from `src/lib/middleware/auth.ts` for protected endpoints
3. **Rate Limiting**: Apply appropriate rate limiting for all new API endpoints
4. **Error Handling**: Use secure error messages that don't expose sensitive information
5. **Database Queries**: Always use parameterized queries through Drizzle ORM
6. **Environment Variables**: Never commit sensitive data; use `.env` files properly

#### **New API Endpoint Development**

When creating new API endpoints, follow this security checklist:

```typescript
// 1. Define validation schema in src/lib/middleware/validation.ts
export const validationSchemas = {
  newEndpoint: {
    field: { required: true, type: 'string', maxLength: 100, sanitize: true },
  },
};

// 2. Add endpoint protection in src/lib/middleware/auth.ts
export const ENDPOINT_PROTECTION: Record<string, keyof typeof authMiddleware> =
  {
    '/api/new-endpoint': 'protected', // or 'auth', 'financial', 'webauthn', 'public'
  };

// 3. Implement endpoint with security middleware
import { validationMiddleware } from '$lib/middleware/validation';
import { authMiddleware } from '$lib/middleware/auth';

export async function POST(event) {
  // Validation and authentication are handled automatically via hooks.server.ts
  const validatedData = event.locals.validatedData;
  const user = event.locals.user;

  // Your secure endpoint logic here
}
```

#### **Security Testing**

```bash
# Security-focused testing commands
npm run test:production     # Validates production security configuration
npm run type-check         # Ensures type safety (security through types)
npm run lint              # Code quality and security patterns

# Manual security testing
curl -X POST http://localhost:5173/api/test-endpoint \
  -H "Content-Type: application/json" \
  -d '{"malicious": "<script>alert(1)</script>"}'
# Should return 400 with validation errors
```

#### **Database Development**

```bash
# Database operations
npm run db:generate        # Generate new migration files
npm run db:migrate         # Apply migrations to development database
npm run db:studio         # Open Drizzle Studio for database management

# Production database operations (Railway)
npm run migrate:prod      # Run migrations with production safeguards
```

#### **Monitoring & Debugging**

```bash
# Development monitoring
npm run dev               # Includes comprehensive logging and monitoring
# Check logs for security events in development console

# Production monitoring endpoints
curl http://localhost:5173/api/health    # Health check with database status
curl http://localhost:5173/api/metrics   # Application metrics (if enabled)
```

### **Common Development Patterns**

#### **Secure Service Implementation**

```typescript
// Example: Creating a new secure service
export class SecureService {
  private static instance: SecureService;

  static getInstance(): SecureService {
    if (!SecureService.instance) {
      SecureService.instance = new SecureService();
    }
    return SecureService.instance;
  }

  async secureOperation(input: string, userId: string): Promise<Result> {
    // 1. Validate input (already done by middleware)
    // 2. Check user permissions
    // 3. Implement business logic with error handling
    // 4. Log security events if needed

    try {
      const result = await this.performOperation(input);
      return { success: true, data: result };
    } catch (error) {
      logSecurityEvent(
        'operation_failed',
        {
          userId,
          operation: 'secureOperation',
          error: error.message,
        },
        'medium'
      );

      throw new Error('Operation failed'); // Don't expose internal errors
    }
  }
}
```

#### **Error Handling Pattern**

```typescript
// Secure error handling that doesn't leak information
export function handleApiError(error: unknown): Response {
  if (error instanceof ValidationError) {
    return json(
      { message: 'Validation failed', errors: error.details },
      { status: 400 }
    );
  }

  if (error instanceof AuthenticationError) {
    return json({ message: 'Authentication required' }, { status: 401 });
  }

  // Log internal errors but don't expose details
  logger.error('Internal server error', error);
  return json({ message: 'Internal server error' }, { status: 500 });
}
```

## Railway Deployment

### Prerequisites

1. **PostgreSQL Database**: Set up a hosted PostgreSQL database (recommended options):
   - **Railway Postgres** (integrated with Railway)
   - **Neon** (serverless PostgreSQL)
   - **Supabase** (PostgreSQL + additional features)

### Deployment Steps

1. **Deploy to Railway**:
   - Connect your GitHub repository to Railway
   - Railway will automatically detect the Node.js project
   - Configure environment variables in Railway dashboard

2. **Configure Environment Variables** in Railway Dashboard:

   ```
   DATABASE_URL=postgresql://username:password@host:5432/database
   SESSION_SECRET=your-super-secret-session-key-64-characters-long
   PUBLIC_STARKNET_RPC_URL=https://your-starknet-provider.com
   PUBLIC_DEPLOYER_ADDRESS=0x...
   PUBLIC_DEPLOYER_PRIVATE_KEY=0x...
   NODE_ENV=production
   GITHUB_TOKEN=ghp_your_github_personal_access_token
   ```

3. **Database Migration**:
   - Railway automatically runs `npm run migrate:prod` before starting the app
   - Database tables are created/updated on each deployment
   - Migration includes retry logic for connection reliability

### Railway-Specific Features

- **Automatic Database Migration**: Runs migrations on each deployment
- **PostgreSQL Integration**: Built-in PostgreSQL service with automatic connection
- **Health Check**: Available at `/api/health`
- **Automatic SSL**: Production SSL certificates handled automatically
- **GitHub Package Registry**: Supports private package installation with GITHUB_TOKEN

### Package Dependencies

This project uses the official `@atomiqlabs/chain-starknet` package from npm. No special setup is required for deployment.

### **Production Security Checklist**

#### **🔒 Environment Security**

- [ ] **Environment Variables**: All sensitive data in environment variables, not code
- [ ] **Secret Rotation**: Regular rotation of `SESSION_SECRET` and database credentials
- [ ] **SSL/TLS**: HTTPS enforced in production (handled by Railway automatically)
- [ ] **Node.js Version**: Using supported Node.js version (22.11.0+)

#### **🛡️ Security Headers & Policies**

- [ ] **Content Security Policy**: WebAuthn-compatible CSP enabled
- [ ] **HSTS**: HTTP Strict Transport Security with preload directive
- [ ] **X-Frame-Options**: Clickjacking protection enabled
- [ ] **X-Content-Type-Options**: MIME type sniffing prevention
- [ ] **Permissions-Policy**: Browser API restrictions configured
- [ ] **Cross-Origin Isolation**: Proper CORS and cross-origin policies

#### **🔐 Authentication & Authorization**

- [ ] **Session Security**: HttpOnly, Secure, SameSite cookies configured
- [ ] **WebAuthn Configuration**: Proper origin and RP ID settings
- [ ] **Authentication Middleware**: All protected endpoints secured
- [ ] **User Session Management**: Proper session cleanup and expiration

#### **⚡ Rate Limiting & DDoS Protection**

- [ ] **Multi-Tier Rate Limiting**: IP, user, and endpoint-specific limits active
- [ ] **Progressive Penalties**: Temporary blocking for repeat violations
- [ ] **Financial Endpoint Protection**: Extra strict limits on money operations
- [ ] **Rate Limit Monitoring**: Security event logging enabled

#### **🔍 Input Validation & Sanitization**

- [ ] **Schema Validation**: All API endpoints have validation schemas
- [ ] **Type-Specific Sanitization**: Starknet, Lightning, Bitcoin format validation
- [ ] **Injection Prevention**: HTML, SQL, XSS protection active
- [ ] **File Upload Security**: If applicable, secure file handling

#### **💾 Database Security**

- [ ] **Connection Security**: SSL-encrypted database connections
- [ ] **Query Security**: Parameterized queries only (via Drizzle ORM)
- [ ] **Connection Pooling**: Proper connection limits and timeouts
- [ ] **Database Backup**: Regular automated backups configured
- [ ] **Access Controls**: Database user with minimal required permissions

#### **📊 Monitoring & Incident Response**

- [ ] **Security Event Logging**: All security violations logged
- [ ] **Health Monitoring**: `/api/health` endpoint monitoring configured
- [ ] **Error Tracking**: Production error monitoring
- [ ] **Request Correlation**: Unique request IDs for incident tracking
- [ ] **Alert Configuration**: Alerts for security events and rate limit violations

#### **🚀 Production Deployment Validation**

```bash
# Run before production deployment
npm run test:production     # Comprehensive production readiness check
npm run type-check         # Ensure type safety
npm run build              # Verify production build succeeds
npm run validate:env       # Validate all required environment variables
```

#### **📋 Production Environment Variables Checklist**

**Required Security Environment Variables:**

```bash
# Database Security
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Session Security
SESSION_SECRET=your-super-secret-session-key-minimum-64-characters-long

# Application Security
NODE_ENV=production
PUBLIC_STARKNET_RPC_URL=https://your-secure-starknet-provider.com

# Deployment Security
PUBLIC_DEPLOYER_ADDRESS=0x...     # Deployer wallet address
PUBLIC_DEPLOYER_PRIVATE_KEY=0x... # Store securely, consider key management service

# Optional Security Enhancements
MONITORING_ENDPOINT=your-monitoring-webhook-url
```

#### **🔄 Post-Deployment Security Verification**

```bash
# Verify security headers
curl -I https://your-app.railway.app/api/health
# Should include: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options

# Test rate limiting
for i in {1..10}; do curl -X POST https://your-app.railway.app/api/auth/login; done
# Should return 429 after hitting rate limits

# Verify HTTPS enforcement
curl -I http://your-app.railway.app/
# Should redirect to HTTPS

# Test CSP compliance
# Open browser developer tools, check for CSP violations in console
```

### Production Considerations

- **Database Connection Pooling**: Configured for Railway serverless environments with SSL
- **Session Management**: Secure cookies with HttpOnly, Secure, and SameSite flags
- **Security Headers**: Comprehensive CSP, HSTS, and security headers configured
- **Error Handling**: Secure error handling that doesn't leak sensitive information
- **Rate Limiting**: Multi-tier API protection with progressive penalties
- **Input Validation**: All endpoints protected with schema-based validation
- **Security Monitoring**: Real-time security event logging and correlation

### Environment Variables

Required for production:

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secret key for session encryption (minimum 32 characters)
- `PUBLIC_STARKNET_RPC_URL` - Starknet provider URL
- `PUBLIC_DEPLOYER_ADDRESS` - Deployer wallet address
- `PUBLIC_DEPLOYER_PRIVATE_KEY` - Deployer wallet private key
- `NODE_ENV` - Set to `production`

### Migration Process

Database migrations run automatically during deployment via the enhanced migration script:

```bash
npm run migrate:prod
```

The migration script includes:

- Retry logic with exponential backoff
- SSL configuration for production
- Connection validation
- Comprehensive error handling

### Monitoring

- Health check endpoint: `GET /api/health`
- Database connection status included in health check
- Railway provides built-in monitoring and logging

### Production Readiness Test

Before deploying to Railway, run our production readiness test:

```bash
npm run test:production
```

This validates:

- ✅ All required files and scripts are present
- ✅ Production build completes successfully
- ✅ No critical security vulnerabilities
- ✅ Environment validation works correctly

### Detailed Deployment Instructions

For complete step-by-step Railway deployment instructions, see:
**[RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)**

## Features

### WebAuthn Authentication Flow

- **User Registration**: Create username and email, generate WebAuthn passkey
- **Database Storage**: User credentials stored in PostgreSQL with encrypted session management
- **Login**: Authenticate using WebAuthn passkey, no passwords needed
- **Session Management**: Secure server-side sessions with automatic cleanup

### Starknet Integration

- **Account Contract**: Deploy Argent-style smart contract accounts with WebAuthn + Stark key signers
- **Gasless Deployment**: All account deployments use AVNU paymaster for zero-gas transactions
- **Transaction Signing**: Sign transactions using WebAuthn passkey
- **Blockchain Deployment**: Deploy account contracts to Starknet testnet with comprehensive error handling

### AVNU Paymaster Integration

- **Gasless Transactions**: Users deploy accounts without needing ETH for gas fees
- **Paymaster-Only Deployment**: Enforced gasless deployment prevents accidental self-pay transactions
- **Secure Server-Side Processing**: Account deployment handled securely through server APIs
- **Automatic Fee Estimation**: Smart fee calculation with buffer for reliable deployment

### Security Features

#### **Enterprise-Grade Security Architecture**

- **Content Security Policy (CSP)**: WebAuthn-compatible CSP with nonce support for script execution
- **Security Headers**: Comprehensive security headers including HSTS, X-Frame-Options, X-Content-Type-Options
- **Cross-Origin Isolation**: Proper CORS configuration and cross-origin resource policy
- **Permission Restrictions**: Limited browser API access through Permissions Policy

#### **Multi-Tier Authentication & Authorization**

- **Authentication Middleware**: Endpoint-specific authentication requirements (auth, financial, WebAuthn, API)
- **Method Validation**: HTTP method restrictions per endpoint type
- **Session Security**: Server-side sessions with HttpOnly, Secure, and SameSite cookies
- **WebAuthn Security**: Credential uniqueness enforcement and secure attestation

#### **Advanced Rate Limiting System**

- **Multi-Tier Protection**: IP-based, user-based, and endpoint-specific rate limiting
- **Progressive Penalties**: Temporary blocking with exponential backoff
- **Endpoint-Specific Limits**:
  - Authentication endpoints: 5 requests/minute (5-minute blocks)
  - Financial operations: 10 requests/5 minutes (15-minute blocks)
  - WebAuthn operations: 15 requests/minute (2-minute blocks)
  - General API: 100 requests/minute (1-minute blocks)
  - Read-only: 200 requests/minute (30-second blocks)

#### **Comprehensive Input Validation**

- **Type-Specific Sanitization**: Starknet addresses, Lightning invoices, amounts, swap IDs
- **Schema-Based Validation**: Pre-defined validation schemas for all API endpoints
- **Injection Prevention**: HTML, SQL, and XSS attack prevention
- **Unexpected Field Detection**: Security alerts for potential injection attempts

#### **Security Monitoring & Logging**

- **Security Event Logging**: Real-time logging of rate limit violations, authentication failures
- **Suspicious Activity Detection**: Monitoring for unexpected API usage patterns
- **CSP Violation Reporting**: Content Security Policy violation tracking
- **Request Correlation**: Unique request IDs for security incident tracking

#### **Database & Infrastructure Security**

- **Parameterized Queries**: SQL injection prevention through ORM
- **Connection Pooling**: Secure database connections with SSL
- **Environment Isolation**: Secure environment variable handling
- **Error Sanitization**: Secure error messages that don't leak sensitive information

## API Endpoints

### **Endpoint Protection Levels**

All API endpoints are protected by our comprehensive security middleware with the following protection levels:

#### **🔐 Authentication Endpoints** (Rate Limited: 5/min)

- `POST /api/auth/register` - Register new user with WebAuthn
- `POST /api/auth/login` - Login with WebAuthn assertion
- `POST /api/auth/logout` - Logout and clear session
- **Protection**: Method validation, aggressive rate limiting, input sanitization
- **Authentication**: Not required (creates authentication)

#### **💰 Financial Operations** (Rate Limited: 10/5min, Auth Required)

- `POST /api/lightning/invoice` - Create Lightning invoice
- `POST /api/lightning/pay` - Pay Lightning invoice
- `GET /api/lightning/balance` - Get Lightning balance
- `GET /api/lightning/channels` - Get Lightning channels
- `POST /api/bitcoin/swap` - Create Bitcoin swap
- `GET /api/bitcoin/address` - Get Bitcoin address
- `GET /api/bitcoin/transaction` - Get Bitcoin transaction
- **Protection**: Authentication required, strict rate limiting, comprehensive validation
- **Input Validation**: Amount validation, Lightning invoice format, Bitcoin address validation

#### **🔑 WebAuthn Operations** (Rate Limited: 15/min)

- `GET /api/webauthn/register/begin` - Begin WebAuthn registration
- `POST /api/webauthn/register/complete` - Complete WebAuthn registration
- `GET /api/webauthn/authenticate/begin` - Begin WebAuthn authentication
- `POST /api/webauthn/authenticate/complete` - Complete WebAuthn authentication
- **Protection**: Method validation, moderate rate limiting, credential validation
- **Authentication**: Not required (creates/validates authentication)

#### **🛡️ Protected API Endpoints** (Rate Limited: 100/min, Auth Required)

- `POST /api/starknet/deploy` - Deploy Starknet account
- `GET /api/starknet/account` - Get Starknet account info
- `POST /api/starknet/transaction` - Submit Starknet transaction
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/settings` - Update user settings
- `POST /api/avnu/deploy-account` - Deploy account using AVNU paymaster
- **Protection**: Authentication required, standard rate limiting, full validation
- **Input Validation**: Starknet address format, transaction parameters, user data

#### **📖 Public Read-Only Endpoints** (Rate Limited: 200/min)

- `GET /api/health` - Health check endpoint with database status
- `GET /api/status` - Application status and version
- `GET /api/metrics` - Application metrics (if enabled)
- **Protection**: Method validation (GET only), permissive rate limiting
- **Authentication**: Not required

### **API Security Features**

#### **Request Validation Pipeline**

1. **Method Validation**: Only allowed HTTP methods accepted per endpoint
2. **Rate Limiting**: Multi-tier rate limiting (IP + endpoint + user based)
3. **Authentication Check**: Session-based authentication for protected endpoints
4. **Input Validation**: Schema-based validation with type-specific sanitization
5. **Security Logging**: All violations logged with request correlation IDs

#### **Error Responses**

- **401 Unauthorized**: Authentication required but not provided/invalid
- **403 Forbidden**: Valid authentication but insufficient permissions
- **405 Method Not Allowed**: HTTP method not allowed for endpoint
- **429 Too Many Requests**: Rate limit exceeded (includes retry-after header)
- **400 Bad Request**: Input validation failed (includes validation errors)

#### **Response Headers**

- **X-Request-ID**: Unique correlation ID for request tracking
- **X-RateLimit-Remaining**: Requests remaining in current window
- **X-RateLimit-Reset**: Unix timestamp when rate limit resets
- **Retry-After**: Seconds to wait before retrying (for 429 responses)

## Technical Implementation

### **Security-First Architecture**

#### **Request Pipeline Security**

```
Request → Security Headers → Rate Limiting → Authentication → Validation → Route Handler
```

1. **Security Headers**: CSP, HSTS, X-Frame-Options applied automatically
2. **Rate Limiting**: Multi-tier protection (IP + endpoint + user)
3. **Authentication**: Session-based auth with WebAuthn integration
4. **Input Validation**: Schema-based validation and sanitization
5. **Route Handler**: Secure business logic with error handling

#### **Core Architecture**

- **Database**: PostgreSQL with Drizzle ORM, SSL connections, and parameterized queries
- **Authentication**: WebAuthn (passkeys) with secure server-side sessions and CSRF protection
- **Frontend**: SvelteKit with TypeScript, CSP-compliant scripts, and security-focused components
- **Blockchain**: Starknet with starknet.js, AVNU integration, and secure RPC configuration
- **Security Middleware**: Comprehensive middleware pipeline for all API endpoints

#### **Security Service Architecture**

- **Security Utils** (`src/lib/utils/security.ts`): CSP generation, input sanitization, security event logging
- **Authentication Middleware** (`src/lib/middleware/auth.ts`): Endpoint protection, rate limiting, method validation
- **Validation Middleware** (`src/lib/middleware/validation.ts`): Schema-based input validation and sanitization
- **Rate Limiting Service** (`src/lib/utils/network/rate-limit.ts`): Multi-tier rate limiting with progressive penalties

#### **Service Architecture**

- **Singleton Services**: StarknetService, WebauthnService, and AvnuService with security-focused design
- **Security Monitoring**: Real-time security event logging and request correlation
- **Caching Layer**: Secure caching for account addresses and fee estimations
- **Error Handling**: Secure error handling that doesn't leak sensitive information
- **Performance**: Optimized with secure caching, connection pooling, and efficient queries

#### **Security-Enhanced Development Experience**

- **Security Documentation**: Comprehensive security guidelines and best practices
- **Type Safety**: Full TypeScript coverage with strict type checking for security
- **Security Testing**: Production readiness validation and security checks
- **Code Organization**: Clean architecture with security-oriented middleware design
- **Security Patterns**: Reusable security patterns and middleware for consistent protection

### Monitoring & Observability

- **Health Checks**: Database connectivity and application health monitoring
- **Metrics**: Application performance metrics and usage tracking
- **Logging**: Comprehensive logging with structured error reporting
