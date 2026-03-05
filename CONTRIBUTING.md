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

## Pull request guidelines

Open small, focused PRs with enough context to review quickly.

Include in your PR description:

- What changed and why
- Linked issue(s) (if any)
- Test evidence (commands run)
- Screenshots/video for UI changes

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
