# Security Policy

BIM is a Bitcoin wallet. It handles cryptographic keys, user funds, and
payment flows on top of the Lightning Network and Starknet. Security is
therefore taken **very** seriously — we welcome and appreciate responsible
disclosure.

> ⚠️ **BIM is still alpha software.** It is under active development and
> has not undergone a formal third-party audit. Do not use it to custody
> funds you cannot afford to lose.

## Supported Versions

At this stage, only the `main` branch receives security updates. Tagged
releases will be added to this table once the project reaches a stable
version.

| Version  | Supported          |
| -------- | ------------------ |
| `main`   | :white_check_mark: |
| < 0.1.0  | :x:                |

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**
Public disclosure before a fix is available can put users at risk.

Instead, use one of the following private channels:

1. **GitHub Private Vulnerability Report** (preferred) — go to the
   repository's **Security** tab → **Report a vulnerability**. This creates
   a private advisory visible only to maintainers.

2. **Email** — send a report to:

   **coming soon (TODO)**

   If possible, encrypt your message with the maintainer's PGP key (a key
   fingerprint will be published here once available).

### What to include in your report

Please provide as much of the following information as you can, so we can
reproduce and assess the issue quickly:

- A description of the vulnerability and its potential impact
- Steps to reproduce, including sample code, requests, or payloads
- The affected component (backend API, frontend, domain layer, indexer,
  infra, specific package)
- The commit hash or version you tested against
- Any known mitigations or workarounds
- Your name / handle, if you would like to be credited in the fix

### What happens next

- We will acknowledge your report within **3 business days**.
- We will investigate and keep you informed of our progress.
- Once a fix is ready, we will coordinate a disclosure timeline with you.
- We will credit you in the release notes and the CVE (if applicable),
  unless you prefer to remain anonymous.

## Scope

In-scope for this policy:

- **Key management and WebAuthn flows** — anything that could compromise
  user credentials, bypass authentication, or lead to unauthorized
  signatures.
- **Payment flows** — receive / pay / swap logic (Lightning, Bitcoin,
  Starknet), including fee manipulation, replay, or fund diversion.
- **AVNU paymaster integration** — any issue that could lead to
  unauthorized gasless transactions.
- **Backend API** — injection, authentication/authorization bypass,
  privilege escalation, SSRF, XSS (for the served frontend), CSRF.
- **Database layer** — SQL injection, data exposure, missing access
  controls.
- **Infrastructure / CI / build** — supply-chain risks in the build or
  deploy pipeline.

Out of scope:

- Denial-of-service attacks that require disproportionate effort to
  mitigate (e.g., flooding a public endpoint with requests)
- Social-engineering of maintainers or contributors
- Vulnerabilities requiring physical access to a user's device
- Issues in third-party dependencies already disclosed upstream — please
  report those to the upstream project instead
- Missing security hardening headers on pages that do not handle sensitive
  data

## Good-Faith Research

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction,
  and service interruption
- Only interact with accounts they own or have explicit permission to test
- Give us a reasonable amount of time to investigate and remediate before
  disclosing publicly
- Do not exploit a vulnerability beyond what is necessary to confirm its
  existence

Thank you for helping keep BIM and its users safe.
