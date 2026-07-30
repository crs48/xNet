# Contributing to xNet

Thanks for your interest in contributing.

xNet is a TypeScript monorepo with strict type checking, strong quality gates, and a local-first sync architecture. This guide covers the fastest path to making a solid PR.

## Development setup

### Requirements

- Node.js `>=20`
- `pnpm` (repo uses `pnpm@10.30.3`)
- macOS, Linux, or Windows

### Install

```bash
pnpm install
```

## Project layout

- `packages/` core libraries (`@xnetjs/*`)
- `apps/` product apps (`electron`, `web`, `expo`)
- `tests/` integration/e2e tests
- `docs/` architecture docs, plans, and explorations

See `README.md` for package details and architecture context.

## Typical development commands

```bash
# Build all packages
pnpm build

# Run full test suite
pnpm test

# Type checking
pnpm typecheck

# Lint
pnpm lint
```

Useful package-level workflows:

```bash
# Package tests
pnpm --filter @xnetjs/sync test

# Single test file
pnpm --filter @xnetjs/sync vitest run src/clock.test.ts

# Match tests by pattern
pnpm --filter @xnetjs/data vitest run -t "NodeStore"
```

## Code style and architecture rules

Follow existing patterns in the touched package. Key rules:

- TypeScript strict mode; avoid `any` (prefer `unknown` + narrowing)
- Prefer `type` over `interface` for object shapes
- Named exports only (no default exports)
- Keep changes minimal and focused
- Lower-level packages cannot import from higher-level packages

Dependency direction:

```text
crypto -> identity -> storage -> sync -> data -> react -> sdk
                                -> network -> query
```

## Testing expectations

- Add or update tests when changing package behavior
- Prefer focused package tests while iterating
- Before opening a PR, run:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

## Versioning

xNet is **alpha**. Read [`STABILITY.md`](./STABILITY.md) before changing
anything exported from a publishable package — it defines which surfaces carry
a compatibility promise and which don't.

Two rules matter when you touch `packages/*`:

1. **Bump from the diff, not the commit prefix.** A removed or renamed export,
   a changed signature, or a changed protocol/hash/wire contract is a
   **major** — even if the commit says `fix:`. No JS tool can detect this for
   us, so it is a human judgement, and the conservative call is the right one.
2. **A protocol constant change is always a major.** `CURRENT_PROTOCOL_VERSION`,
   `XNET_SYNC_ENVELOPE_VERSION`, `SCHEMA_VERSION`, `XNETPACK_FORMAT_VERSION` and
   friends are wire-visible. The Stop hook enforces this; see
   `scripts/changeset/assert-coverage.mjs`.

The package version number is not a maturity claim (2.x is a historical
artifact, and npm does not permit renumbering downward). The API tier is the
real promise — see the committed `packages/*/etc/*.api.md` reports.

## Commit and hook requirements

This repo uses Husky hooks on commit and push. Your commits must pass hooks.

Use Conventional Commits:

```text
type(scope): description
```

Examples:

- `feat(sync): add peer scoring for Yjs updates`
- `fix(data): handle null schema in NodeStore`
- `test(identity): add WebAuthn emulator coverage`

Do not bypass hooks during normal contribution flow. If a hook fails, fix the underlying issue and re-run.

## Developer Certificate of Origin (DCO)

xNet uses the [Developer Certificate of Origin](https://developercertificate.org/).
By adding a `Signed-off-by` line to each commit, you certify you wrote the patch or
otherwise have the right to submit it under the project's licenses (MIT for the core,
FSL for `@xnetjs/cloud`). There is **no CLA** and no copyright assignment — see
[`GOVERNANCE.md`](./GOVERNANCE.md).

Sign off automatically with:

```bash
git commit -s -m "feat(scope): your change"
```

The `Signed-off-by: Your Name <you@example.com>` line must match your commit author.
A CI check (`.github/workflows/dco.yml`) verifies every commit in a PR is signed off.

## Pull request guidelines

Open small, focused PRs with enough context to review quickly.

Include in your PR description:

- What changed and why
- Linked issue(s) (if any)
- Test evidence (commands run)
- Screenshots/video for UI changes

> For UI changes, CI also auto-captures this. The **Visual UI Capture** workflow
> (`.github/workflows/visual-capture.yml`) screenshots the components and screens
> your PR touches, diffs them against `main`, and posts a before/after gallery
> (plus an interaction GIF for tagged flows) as a sticky PR comment. It is
> informational — not a required check — and supplements, not replaces, the
> screenshots you add yourself. See [`scripts/visuals/README.md`](scripts/visuals/README.md).

## UI and app-specific notes

- Prefer implementing and validating new product features in `apps/electron` first
- For browser automation/Playwright flows, enable auth bypass before assertions:

```javascript
localStorage.setItem('xnet:test:bypass', 'true')
location.reload()
```

- For Playwright tests, call `setupTestAuth(page)` before app interactions

## Electron native module gotcha

When Electron ABI changes, native modules may require rebuilds.

```bash
pnpm dlx @electron/rebuild -f -w better-sqlite3,usearch,sharp
```

## Clean shutdown after local testing

If you start local dev servers for Electron/Web/test runs, stop them before finishing.

```bash
lsof -ti:5177,4444,3000,8080 2>/dev/null | xargs kill -9 2>/dev/null
pkill -f "vite" 2>/dev/null; pkill -f "electron" 2>/dev/null; pkill -f "signaling" 2>/dev/null
```

Thanks again for contributing.
