# AGENTS

## Purpose

- Mission: Simple Bitcoin wallet on Starknet leveraging Webauthn for keys management, to receive and pay via Starknet, Lightning or Bitcoin.
- Scope: SvelteKit client + Node adapter server; Atomiq SDK for swaps; Drizzle ORM; pricing via CoinGecko.

## Tech Stack

- Framework: SvelteKit + Vite; adapter-node (`@sveltejs/adapter-node`).
- Language: TypeScript, Svelte 5.
- Backend: SvelteKit server routes under `src/routes/api/*`.
- DB: Postgres via Drizzle ORM (`drizzle-orm`); migrations in `drizzle/`.
- Pricing: Client-side orchestrator with fetcher + cache + fallback.
- Tests: Vitest for unit tests, Playwright for E2E (`npm run test`, `npm run test:e2e`).
- Node: `>= 22.12.0`.

## Key Workflows

- Receive from Lightning: `src/routes/receive/+page.svelte` → `LightningReceive` → `SwipeableCardContainer` → `LightningCard`.
- Send to Lightning: `src/routes/pay/+page.svelte`.
- Starknet ↔ Lightning swap: components under `src/lib/components/lightning/*`, server endpoints under `src/routes/api/lightning/*`.
- Pricing: `PricingOrchestrator` → `PriceFetcher` (CoinGecko) → `CacheManager` → `FallbackProvider`.

## Code Map

- UI Components: `src/lib/components/`
  - Lightning receive: `lightning/LightningReceive.svelte`, `LightningCard.svelte`, `BitcoinCard.svelte`, `StarknetCard.svelte`, `AmountInput.svelte`, `PaymentGenerator.svelte`, `PaymentDisplay.svelte`, `PaymentMonitor.svelte`, `ClaimingComponent.svelte`, `ClaimActions.svelte`, `ClaimResult.svelte`, `SwipeableCardContainer.svelte`, `LightningInvoiceProcessor.svelte`, `PaymentMethodSelector.svelte`, `StarknetReceive.svelte`, `StarknetReceiveDisplay.svelte`, `StarknetToLightning.svelte`, `SwapDetails.svelte`, `SwapForm.svelte`, `TransactionConfirmation.svelte`.
  - Gestures: `src/lib/utils/swipe-gestures.ts` (swipe action for mobile).
- Routes:
  - UI pages: `src/routes/*`
  - API routes (server): `src/routes/api/*` (e.g., `lightning/create-invoice`, `lightning/claim-swap`, `lightning/swap-status/[swapId]`, `lightning/webhook`).
- Pricing:
  - Orchestrator: `src/lib/services/client/pricing/pricing-orchestrator.ts`
  - Fetcher: `src/lib/services/client/pricing/price-fetcher.ts`
  - Types: `src/lib/services/client/pricing/types.ts`
  - Cache: `src/lib/services/client/pricing/cache-manager.ts`
  - Fallback: `src/lib/services/client/pricing/fallback-provider.ts`
- DB + Migrations: `drizzle/`, `drizzle.config.ts`.
- Config/Build: `package.json`, `svelte.config.js`, `vite.config.ts`.

## Environment & Config

- Required vars (see `scripts/validate-env.js` for validation):
  - `DATABASE_URL`: Postgres connection string.
  - `PUBLIC_STARKNET_RPC_URL`: Starknet RPC endpoint.
  - `NODE_ENV`: `development` or `production`.
- Deployment presets: see `railway.json`.

## Run & Build

- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Typecheck: `npx svelte-check`
- Lint/Format: `npm run lint:prettier`

## Receive UX

- Cards: Lightning, Bitcoin, Starknet in a 3-card carousel; swipe to switch.
- Gestures: `swipe-gestures.ts` handles touch/mouse swipes.
- Mobile controls: Elements marked with `data-swipe-ignore` bypass swipe interception. Use this for small tap targets (e.g., unit toggles).
- Amount input:
  - Modes: `sats`, `btc`, `usd`.
  - Conversions: Uses live FX from `PricingOrchestrator` when `btc`/`usd` selected.
  - Feedback:
    - BTC mode → shows USD equivalent.
    - USD mode → shows sats equivalent.
    - Sats mode → no extra conversion line.

## Server API Endpoints (Lightning)

- `POST /api/lightning/create-invoice`: Create a Lightning invoice (swap to destination asset).
- `POST /api/lightning/create-starknet-to-lightning`: Create swap from Starknet to Lightning.
- `POST /api/lightning/claim-swap/[swapId]`: Claim after payment confirmation.
- `GET /api/lightning/swap-status/[swapId]`: Poll swap status; includes `amountReceived`.
- `POST /api/lightning/webhook`: Payment/processing webhooks.
- `GET /api/lightning/get-unsigned-txns/[swapId]`: Get unsigned transactions for swap.
- `GET /api/lightning/get-unsigned-claim-txns/[swapId]`: Get unsigned transactions for claim.
- `POST /api/lightning/submit-signed-txns/[swapId]`: Submit signed transactions.
- `POST /api/lightning/start-payment-waiting/[swapId]`: Start payment waiting process.
- `GET /api/lightning/quote`: Get swap quote.
- `GET /api/lightning/rates`: Get exchange rates.
- `GET /api/lightning/limits`: Get swap limits.
- `GET /api/lightning/supported-assets`: Get supported assets.
- `GET /api/lightning/verify-swap-state/[swapId]`: Verify swap state.
- Long-pollers: `wait-claim-confirmation/[swapId]`, `wait-commit-confirmation/[swapId]`.
- Bitcoin swap endpoints: `api/bitcoin/*` (for on-chain):
  - `POST /api/bitcoin/create-swap`: Create Bitcoin swap.
  - `POST /api/bitcoin/create-starknet-to-bitcoin`: Create swap from Starknet to Bitcoin.
  - `GET /api/bitcoin/swap-status/[swapId]`: Get Bitcoin swap status.
  - `POST /api/bitcoin/recover-swap/[swapId]`: Recover Bitcoin swap.

## Pricing Service

- `PricingOrchestrator.getInstance().getPrice('WBTC')` returns `{ asset, usdPrice, btcPrice, lastUpdated, source }`.
- Fetcher tries CoinGecko (keyed + public), logs failures, falls back to cached/stale/fallback.
- Cache TTL configured in `CacheManager`.

## Database

- Drizzle schema and migrations: `drizzle/*.sql`, snapshots in `drizzle/meta/*`.
- `DATABASE_URL` required for server routes that persist or query state.
- Key tables:
  - `users`: WebAuthn credentials (credentialId, publicKey, signCount), username.
  - `sessions`: User sessions with expiration.
  - `webauthn_challenges`: Short-lived challenges for registration/auth ceremonies.
  - `user_settings`: User preferences (fiat currency, etc.).
  - `user_addresses`: Registered Starknet addresses per user.
  - `user_transactions`: Transaction history for tracked addresses.
- Schema: `src/lib/db/schema.ts`; migrations: `npm run db:generate`, `npm run db:migrate`.

## Logging & Debugging

- Useful scripts: see `scripts/*` (debug recent tx, WBTC selection tests, scanner diagnostics).

## Authentication & WebAuthn

- **Registration Flow**: User creates username → WebAuthn credential created → User stored in DB → Starknet account auto-deployed (gasless via AVNU paymaster).
- **Login Flow**: User authenticates with WebAuthn → Server verifies assertion → Session created → User state loaded.
- **Endpoints**: `/api/webauthn/register/begin`, `/api/webauthn/register/complete`, `/api/webauthn/authenticate/begin`, `/api/webauthn/authenticate/complete`.
- **Client Services**: `WebauthnService` (credential creation/assertion), `AuthenticationService` (login/logout), `SessionService` (session management).
- **Server Verification**: `src/lib/utils/webauthn/server-verification.ts` handles signature verification.
- **Session Management**: Server-side sessions with HttpOnly cookies; session cleanup on expiration.

## Account Deployment

- **Flow**: WebAuthn owner created from user credentials → Account address calculated → Deployed via AVNU paymaster (gasless) → Account contract on Starknet.
- **Composable**: `useAccountDeployment(user)` provides reactive state and deployment functions.
- **Service**: `WebauthnAccountService` handles account creation, deployment status checks, and account instance management.
- **Deployment**: Always uses paymaster-sponsored transactions (no user gas required).
- **State**: Tracks deployment phase (`checking`, `not_deployed`, `deploying`, `deployed`), account address, balance, deployment status.

## State Management

- **Stores** (`src/lib/stores/`):
  - `auth.ts`: `currentUser` writable store for authenticated user state.
  - `i18n.ts`: Internationalization state and ready flag.
  - `navigation-guard.ts`: Guards against navigation during critical flows (claiming, signing).
  - `starknet.ts`: Starknet-specific state (if any).
- **Composables** (`src/lib/composables/`):
  - `useAccountDeployment(user)`: Account deployment state and actions.
  - `usePaymentMonitorState()`: Payment monitoring state for swap tracking.
  - `useStarknetToLightningSwap()`: Swap flow state management.
- **Pattern**: Use Svelte stores for reactive state; composables for complex stateful logic.

## Service Architecture

- **Client Services** (`src/lib/services/client/`):
  - `auth/`: Authentication, WebAuthn, session management.
  - `lightning/`: Lightning swap client operations.
  - `pricing/`: Price fetching, caching, fallback.
  - `starknet.client.service.ts`: Starknet account operations (client-side).
  - `webauthn-account.service.ts`: WebAuthn account deployment and management.
  - `payment.service.ts`: Payment processing.
  - `transaction/`: Transaction signing and submission.
- **Server Services** (`src/lib/services/server/`):
  - `atomiq/`: Atomiq SDK integration for swaps.
  - `lightning/`: Lightning swap server operations.
  - `starknet.server.service.ts`: Server-side Starknet operations.
  - `blockchain-scanner.service.ts`: Blockchain event scanning.
  - `background-jobs.service.ts`: Background task processing.
- **Pattern**: Singleton services with `getInstance()`; client services for browser, server services for backend.

## Swap Flow (Lightning)

- **Lightning → Starknet**: User pays Lightning invoice → Atomiq processes swap → User claims on Starknet via signed transactions.
- **Starknet → Lightning**: User initiates swap → Signs transactions → Submits to Starknet → Receives Lightning invoice → Pays invoice.
- **Key Components**: `LightningReceive`, `StarknetToLightning`, `PaymentMonitor`, `ClaimingComponent`.
- **State Tracking**: Swap status polling, payment monitoring, claim confirmation.
- **Endpoints**: Create swap → Get unsigned txns → Submit signed txns → Monitor status → Claim.

## Internationalization

- **Library**: `svelte-i18n` for translations.
- **Store**: `i18nReady` store indicates when translations are loaded.
- **Usage**: `$t('key')` or `$_('key')` in components; `get(_)('key')` in services.
- **Locales**: Translation files in `src/lib/i18n/locales/`.
- **Pattern**: Always check `$i18nReadyStore` before rendering translated content.

## Testing

- **Unit Tests**: Vitest (`npm run test`); test files co-located with source or in `src/test/`.
- **E2E Tests**: Playwright (`npm run test:e2e`); tests in `tests/e2e/`.
- **Coverage**: `npm run test:coverage` for coverage reports.
- **Test UI**: `npm run test:ui` for Vitest UI, `npm run test:e2e:ui` for Playwright UI.

## Common Development Patterns

- **Adding API Endpoint**: Create `src/routes/api/[path]/+server.ts` with proper validation and authentication.
- **Adding Component**: Create in `src/lib/components/` with TypeScript types for props.
- **Adding Service**: Use singleton pattern with `getInstance()`; separate client/server concerns.
- **Error Handling**: Use `ApiResponse` helpers from `src/lib/services/shared/api-response/`; don't expose internal errors.
- **State Updates**: Use Svelte stores for reactive state; composables for complex stateful logic.
- **Type Safety**: Always type function parameters, return values, and component props.

## Security & Privacy

- Secrets: never commit real keys; use `.env` and platform secret stores.
- WebAuthn: server has WebAuthn handling; avoid logging sensitive auth objects.
- Input validation: APIs validate Lightning invoices, amounts, addresses; maintain or strengthen validation paths when changing endpoints.
- **Rate Limiting**: Multi-tier protection (IP, user, endpoint-specific) with progressive penalties.
- **Session Security**: HttpOnly, Secure, SameSite cookies; server-side session management.

## Conventions

- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, scope optional). Example: `fix(receive): prevent swipe interception on mobile`.
- Style: Prettier + ESLint configured; run `npm run format` before committing significant changes.
- Types: Use TypeScript types for public interfaces and component props.
- Minimal changes: Keep diffs focused and aligned with existing patterns.
