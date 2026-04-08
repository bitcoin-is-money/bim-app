# Contributing to BIM

First off — thanks for considering a contribution! BIM is a Bitcoin wallet
on Starknet and every report, fix, and improvement is
appreciated. This document explains how to set up the project, the
conventions we follow, and how to get a change merged.

> By contributing, you agree to abide by our
> [Code of Conduct](CODE_OF_CONDUCT.md).

## Table of Contents

- [Getting Help](#getting-help)
- [Reporting Bugs & Security Issues](#reporting-bugs--security-issues)
- [Proposing a Change](#proposing-a-change)
- [Development Setup](#development-setup)
- [Repository Layout](#repository-layout)
- [Coding Conventions](#coding-conventions)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [License](#license)

## Getting Help

- **Questions & discussion** → [GitHub Discussions](https://github.com/bitcoin-is-money/bim/discussions) (once enabled).
- **Bug reports** → [open a bug issue](https://github.com/bitcoin-is-money/bim/issues/new/choose).
- **Security issues** → do **not** open a public issue; see
  [SECURITY.md](SECURITY.md).

## Reporting Bugs & Security Issues

For ordinary bugs, use the bug-report issue template. Please include steps
to reproduce, expected vs. actual behavior, the affected component, your
Node version, and any relevant logs. Search existing issues first to
avoid duplicates.

For anything with security implications — key handling, WebAuthn flows,
payment or paymaster issues, injection, auth bypass — please follow the
private disclosure process in [SECURITY.md](SECURITY.md).

## Proposing a Change

For anything larger than a small fix (new feature, refactor touching
multiple packages, API change), **please open an issue first** so we can
discuss the approach before you invest time in an implementation. This
avoids wasted work if the change doesn't fit the project direction.

Small fixes (typos, obvious bugs, doc improvements) can go straight to a
pull request.

## Development Setup

### Prerequisites

- **Node.js >= 22** (see [`.nvmrc`](.nvmrc); `nvm use` works)
- **npm** (the version is pinned in the root `package.json` via
  `packageManager`)
- **Docker & Docker Compose** (for the local PostgreSQL and integration
  tests)

### First-time setup

```bash
# 1. Clone the repo
git clone https://github.com/bitcoin-is-money/bim.git
cd bim

# 2. Install all workspace dependencies
npm ci

# 3. Start PostgreSQL and push the schema
npm run db:up

# 4. Create the secret env files (they can start empty)
touch apps/api/.env.testnet.secret
touch apps/api/.env.mainnet.secret
touch apps/indexer/.env.testnet.secret
touch apps/indexer/.env.mainnet.secret

# 5. Start the backend (testnet, port 8080)
npm run dev

# 6. In another terminal, start the Angular dev server (port 4200)
npm run dev:front
```

See [`apps/api/.env.local.example`](apps/api/.env.local.example) for the
list of optional secret variables (AVNU API key, Slack tokens, etc.).

### Useful scripts

A full script reference lives in the [README](README.md#scripts-reference).
The most common ones while contributing:

| Command | What it does                             |
|---------|------------------------------------------|
| `npm run dev` | Start the API in watch mode              |
| `npm run dev:front` | Start the Angular dev server in watch mode            |
| `npm test` | Run all unit tests                       |
| `npm run test:integration` | Run API integration tests (needs Docker) |
| `npm run lint` | Lint the whole monorepo                  |
| `npm run lint:fix` | Auto-fix lint errors                     |
| `npm run build` | Build backend + frontend + indexer       |

## Repository Layout

BIM is a TypeScript monorepo managed with npm workspaces.

```
.
├── packages/             # Reusable libraries
│   ├── lib/              # Shared utilities
│   ├── domain/           # Domain layer (hexagonal)
│   ├── db/               # Drizzle schema, migrations, DB client
│   ├── test-toolkit/     # Test helpers (WebAuthn fakes, crypto)
│   ├── atomiq/           # Atomiq SDK adapter
│   ├── atomiq-storage-postgres/  # PostgreSQL storage for Atomiq
│   ├── slack/            # Slack notification adapter
│   └── starknet/         # Starknet RPC utilities
├── apps/                 # Runnable applications
│   ├── api/              # Hono backend (serves API + built frontend)
│   ├── front/            # Angular frontend
│   ├── indexer/          # Apibara Starknet indexer
│   └── cli/              # Operational CLI
├── infra/                # Terraform (Scaleway)
├── doc/                  # Flow diagrams
├── ARCHITECTURE.md       # High-level architecture
└── README.md
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a deeper dive.

## Coding Conventions

- **All code, comments, documentation, commit messages, and file contents
  must be written in English.** This keeps the project accessible to the
  widest possible contributor base.
- **TypeScript strict mode** is enforced across all packages. Avoid `any`;
  prefer branded types for domain identifiers.
- **Hexagonal architecture**: the `domain` layer has no framework
  dependencies. Infrastructure (HTTP, DB, external APIs) lives in
  `apps/api/src/adapters/` behind ports defined in `packages/domain/src/ports/`.
- **ESM everywhere**: every package is `"type": "module"`. Do **not** add
  `.js` extensions to relative imports — the monorepo uses
  `moduleResolution: "bundler"` (see `tsconfig.base.json`), and the
  runtime (`tsx`) and the build (`esbuild`) both resolve extensions
  themselves. Extensions are only required under `NodeNext` resolution,
  which we don't use.
  Note that each package ships **two** TypeScript configs:
  `tsconfig.json` extends `tsconfig.base.json`, sets `noEmit: true`, and
  inherits the workspace `paths` mapping — it exists purely to give the
  IDE (and `tsc --noEmit` typechecks) a coherent view of the monorepo,
  nothing is emitted from it by design. The actual build uses
  `tsconfig.build.json`, which resets `paths: {}` so cross-package
  imports resolve through the real workspace symlinks in `node_modules`
  instead of the IDE path mapping.
- **No silent `try/catch`**: either handle the error meaningfully or let it
  bubble. Validate at system boundaries (HTTP input, external APIs) — not
  between internal modules.
- **Dependencies**: we're not dogmatic about avoiding them. If a library
  is **well-typed, actively maintained, and ships with zero (or very
  few) transitive dependencies**, prefer the library over hand-rolling
  the same logic — reinventing a wheel poorly is worse than a clean
  dependency. On the other hand, a heavy dep pulling dozens of
  transitive packages, or a poorly maintained one, deserves discussion
  first: open an issue and make the case.
- **Linting**: `npm run lint` must pass before a PR is merged. Formatting
  follows the project's Prettier config (where applicable) and ESLint
  rules.

If you use Claude Code, the detailed project conventions are documented
as skills under the `.claude/skills/` directory:
`ts-rules`, `domain-modeling`, `api-routing`, `angular-patterns`,
`testing-conventions`. These are the source of truth for package-specific
patterns.

## Testing

**Every behavior change needs a test.** The rules:

1. **New function or method** → add a unit test.
2. **Modified signature or behavior** → update the existing test.
3. **New API endpoint** → add an integration test in
   `apps/api/test/integration/`.
4. **Modified payment flow** → update the flow test in
   `apps/api/test/integration/flows/`.

Before opening a PR:

```bash
npm test                  # All unit tests across workspaces
npm run test:integration  # API integration tests (requires Docker)
npm run lint              # Lint the whole monorepo
npm run build             # Catch any build-time regressions
```

> ⚠️ **If you changed any `packages/*` library**, rebuild them before
> running the API tests. API tests (and the running API) import from the
> compiled `dist/` of each library, not from source — so stale `dist/`
> output will cause confusing runtime errors or tests that silently run
> against the old code.
>
> The simplest and safest thing is to rebuild all libs in one go:
>
> ```bash
> npm run build:libs
> ```
>
> This covers `@bim/lib`, `@bim/domain`, `@bim/db`, `@bim/test-toolkit`,
> `@bim/atomiq`, `@bim/atomiq-storage-postgres`, `@bim/starknet`, and
> `@bim/slack`.

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body>

<optional footer(s)>
```

**Types** we use:

- `feat` — a new feature
- `fix` — a bug fix
- `refactor` — a code change that neither fixes a bug nor adds a feature
- `docs` — documentation-only changes
- `test` — adding or fixing tests
- `chore` — build, tooling, or dependency changes
- `perf` — a performance improvement

**Scopes** are free-form. They are typically the package or app name
(`api`, `front`, `domain`, `indexer`, `cli`, `db`, `infra`), but they
can also target a specific feature, subsystem, or area of the codebase
when that's clearer than a package name — for example `webauthn`,
`lightning`, `paymaster`, `swap-monitor`, `patches`, `docs`. Pick
whatever gives the most signal in a one-line summary.

Examples drawn from the project history:

```
feat(api): extend startup health checks to all external services
docs(patches): add README for each npm patch explaining purpose
chore: patch Atomiq SDK to truncate HTML LP errors
fix(front): prevent double-submit on pay button
```

Keep the summary line under ~72 characters and write it in the imperative
mood ("add", not "added").

## Pull Request Process

1. **Fork** the repository and create your branch from `main`.
2. **Name** your branch after the change:
   `feat/swap-retry-logic`, `fix/lightning-fee-rounding`, `docs/readme-pass`.
3. **Keep PRs focused** — one logical change per PR. Split unrelated
   cleanups into separate PRs.
4. **Fill in the pull request template** completely. Reviewers rely on the
   checklist to merge confidently.
5. **Make sure CI is green** (tests, lint, build).
6. **Respond to review feedback** — don't force-push until you've had an
   initial review (so reviewers can see incremental changes).
7. Once approved, a maintainer will merge. Small PRs usually ship faster;
   if your PR is large, consider breaking it into a stack.

## License

By contributing to BIM, you agree that your contributions will be
licensed under the [GNU General Public License v3.0 or later](LICENSE),
the same license the project uses.

Thanks again — we're glad you're here.
