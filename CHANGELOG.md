# Changelog

All notable changes to BIM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Nothing yet.

## [0.0.1] — Initial public release

Initial open-source release of BIM — a Bitcoin wallet on Starknet that
uses WebAuthn (passkey / biometric) for key management.

### Added

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
