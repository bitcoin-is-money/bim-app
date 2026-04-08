# Language and communication rules

IMPORTANT:
- All generated code, comments, documentation, commit messages, and file contents MUST be written in English.
- Never generate content in French.
- This rule applies even if the user communicates in French.
- If content normally is generated in French, it must be translated to English before being written.

---

# Code modification policy

IMPORTANT:
- Never modify code directly without explicit user confirmation.
- Before making any code changes, you must:
  1. Explain what you're going to do
  2. Show the proposed changes or approach
  3. Wait for user confirmation
- This applies to all file modifications (creating, editing, or deleting files).
- Exception: You may proceed directly only if the user has given very explicit instructions about exactly what to change and how.

---

# Mandatory Skills

IMPORTANT:
Before writing any code to disk (Write, Edit), you MUST read the relevant skill(s) for the context:

| Context | Skill to read |
|---------|---------------|
| Any TypeScript code (all packages) | `ts-rules` |
| Domain layer (`packages/domain/`) | `domain-modeling` |
| API routes (`apps/api/src/routes/`) | `api-routing` |
| Angular frontend (`apps/front/`) | `angular-patterns` |
| Tests (any `test/` or `*.test.ts`) | `testing-conventions` |
| Security review / audit | `security-audit` |

- Multiple skills may apply simultaneously (e.g., writing a domain test requires both `ts-rules` and `testing-conventions`).
- `ts-rules` applies to ALL TypeScript code generation without exception.
- Read the skill ONCE per conversation, not before every edit. But if you haven't read it yet in this conversation, read it before your first code write.

---

# Where to look when reasoning

Before proposing a change, consult the relevant reference:

| Situation | Read |
|-----------|------|
| Understanding the overall architecture, layering, package boundaries | `ARCHITECTURE.md` |
| Project overview, setup, scripts, tech stack | `README.md` |
| Contributing rules, branch conventions, PR process | `CONTRIBUTING.md` |
| Security model, threat considerations, reporting | `SECURITY.md` |
| Understanding or modifying a payment/swap flow | `doc/flow/*.md` (receive-lightning, receive-bitcoin, receive-bitcoin-swap-commit, swap-monitor) |
| Recent user-visible changes | `CHANGELOG.md` |

When a task touches a flow (receive, pay, swap monitoring, claim, etc.), **always read the matching `doc/flow/*.md` first** — these documents describe the canonical sequence of events and error paths.

---

# Docs to keep in sync

When you make an impactful change, update the corresponding documentation in the **same** change set. Do not defer.

| Change | Files to update |
|--------|-----------------|
| New feature, new endpoint, user-visible behavior | `README.md`, `CHANGELOG.md` |
| Architectural change (new package, new layer, new dependency, new port/adapter) | `ARCHITECTURE.md` |
| Change to a payment/swap flow | The matching `doc/flow/*.md` |
| New or changed skill-relevant convention | The matching skill file under `.claude/skills/` |
| Security-relevant change (auth, session, WebAuthn, secrets) | `SECURITY.md` |
| New contributing rule, new script, new test command | `CONTRIBUTING.md` |

If a change invalidates an example or diagram in any of these files, update the example/diagram too.

---

# Testing

When modifying code, update the corresponding tests in the same change:

1. **New function/method** → add unit tests
2. **Modified signature** → update callers' tests
3. **Modified behavior** → update assertions
4. **New API endpoint** → add integration test in `apps/api/test/integration/`
5. **Modified API flow** → update the flow test in `apps/api/test/integration/flows/`

Never submit code changes without verifying tests pass. Refer to `CONTRIBUTING.md` and the `testing-conventions` skill for the exact commands and conventions.
