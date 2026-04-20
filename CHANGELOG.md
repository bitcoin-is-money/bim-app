# Changelog

All notable changes to BIM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 2026-04-20: **v1 frontend refresh.** Biometric-first Auth landing with a
  dedicated `/create-account` page; monogram avatar + notification +
  overflow header on Home; hero balance card with amber glow and fx
  secondary line; transaction rows carry rail badges (BTC/LN/SN) and a
  secondary amount. Home promotes Receive/Pay to compact primary /
  secondary tiles.
- 2026-04-20: **Receive page:** segmented network tabs replace carousel
  dots, an icon-square Copy button ships alongside Share, and Lightning
  invoices show a live expiry countdown that auto-resets at zero.
- 2026-04-20: **Pay-confirm:** new rail pill + tabular amount hero,
  details card, dedicated fee strip, and `slide-to-confirm` gesture
  (hold-to-confirm fallback under `prefers-reduced-motion`).
- 2026-04-20: **Design foundation:** new token set (rails, semantic
  states, layered surfaces, text roles), JetBrains Mono for Bitcoin
  data, and motion tokens centralised in `styles-colors.scss`.

## [0.0.1] — Initial public release

Initial open-source release of BIM — a Bitcoin wallet on Starknet that
uses WebAuthn (passkey / biometric) for key management.

### Added

- 2026-04-12: Activity report posted weekly to Slack
- 2026-04-11: FAQ page accessible from the main menu.
- 2026-04-11: Custom PWA install prompt.

### Base features

- **Authentication**: WebAuthn registration and login with challenge-based
  flows, session management, and sign-counter anti-replay protection.
- **Account management**: Account entity with status tracking
  (`pending` → `deploying` → `deployed`), Starknet address derivation, and
  balance retrieval.
- **Auto-deployment**: Gasless account deployment via the AVNU paymaster
  (SNIP-29), triggered transparently on the first payment.
- **Receive payments**: Lightning, Bitcoin, and Starknet via the Atomiq
  SDK; QR code generation; background swap monitor with auto-claim.
- **Pay payments**: Lightning, Bitcoin, and Starknet payments with
  WebAuthn-signed execution; fee estimation; ERC20 call factory.
- **Indexer**: Apibara-based Starknet indexer that watches WBTC transfers
  to registered user addresses and feeds the transaction history.
- **Frontend**: Angular 21 progressive web wallet with auth, home,
  receive, pay, confirm, success, menu, and about pages.
- **CLI tooling**: Operational CLI (`@bim/cli`) for health checks, E2E
  flows, and AVNU credit monitoring, with Slack notifications.
- **Infrastructure**: Docker Compose setup, Scaleway deployment via
  Terraform, GitHub Actions deploy workflow.
- **Open-source readiness**: This release also ships the standard
  open-source project files — README, CONTRIBUTING, CODE_OF_CONDUCT,
  SECURITY, ARCHITECTURE, issue / PR templates, and Dependabot config.

### Notes

- This is an **alpha release**.
- Testnet is the default network. Mainnet usage requires explicit
  configuration.

[Unreleased]: https://github.com/bitcoin-is-money/bim/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/bitcoin-is-money/bim/releases/tag/v0.0.1
