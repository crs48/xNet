# AGENTS.md - Coding Agent Guidelines

Reference for AI coding agents working in the xNet monorepo.

## Build & Test Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests (~2400 tests)
pnpm test

# Run tests for a single package
pnpm --filter @xnet/sync test
pnpm --filter @xnet/data test
pnpm --filter @xnet/canvas test

# Run a single test file
pnpm --filter @xnet/sync vitest run src/clock.test.ts

# Run tests matching a pattern
pnpm --filter @xnet/data vitest run -t "NodeStore"

# Watch mode for a package
pnpm --filter @xnet/sync test:watch

# Type checking
pnpm typecheck

# Lint
pnpm lint

# Run Electron app (starts signaling server + app)
cd apps/electron && pnpm dev

# Run two Electron instances for sync testing
cd apps/electron && pnpm dev:both
```

## Project Structure

```
packages/           # Core libraries (@xnet/*)
  crypto/           # BLAKE3, Ed25519, XChaCha20
  identity/         # DID:key, UCAN tokens
  storage/          # IndexedDB adapter
  sync/             # Lamport clocks, Change<T>, Yjs security
  data/             # Schema system, NodeStore, 15 property types
  react/            # useQuery, useMutate, useNode hooks
  canvas/           # Infinite canvas with spatial indexing
  editor/           # TipTap rich text editor
  devtools/         # Debug panels (7 panels)
apps/
  electron/         # Desktop app (full features)
  web/              # PWA (pages only)
```

## Code Style

### Imports

1. Type-only imports first: `import type { Foo } from './types'`
2. External packages: `import { useState } from 'react'`
3. Internal packages: `import { hash } from '@xnet/crypto'`
4. Local relative imports: `import { helper } from './utils'`

### Naming Conventions

| Category      | Convention            | Example                          |
| ------------- | --------------------- | -------------------------------- |
| Functions     | camelCase, verb-first | `createNode`, `verifySignature`  |
| Types         | PascalCase            | `NodeStore`, `SyncStatus`        |
| Constants     | SCREAMING_SNAKE       | `MAX_UPDATE_SIZE`, `DEFAULT_TTL` |
| Classes       | PascalCase            | `SpatialIndex`, `Viewport`       |
| Type params   | Single uppercase      | `T`, `P`                         |
| Unused params | Prefix with `_`       | `_event`, `_unused`              |

### TypeScript

- Strict mode enabled
- Prefer `type` over `interface` for object shapes
- Use explicit return types on exported functions
- Use template literal types: `namespace: \`xnet://${string}/\``
- No `any` without justification (use `unknown` instead)

### Exports

- Named exports only (no default exports)
- Barrel files (index.ts) re-export from internal modules
- Export types inline: `export { fn, type FnResult }`
- Factory functions for classes: `createFoo()` alongside `class Foo`

### Comments

File-level JSDoc at top:

```typescript
/**
 * @xnet/sync - Unified sync primitives for xNet
 */
```

Section dividers:

```typescript
// ─── Section Name ────────────────────────────────────────
```

Function docs with examples:

```typescript
/**
 * Create a signed envelope for a Yjs update.
 * @example
 * const envelope = signYjsUpdate(update, did, key, clientId)
 */
```

### Error Handling

- Return `{ valid: boolean, errors: [] }` for validation (not exceptions)
- Try-catch with type narrowing: `err instanceof Error ? err : new Error(String(err))`
- Early returns for edge cases
- Boolean returns for simple success/failure

### React Patterns

- Return typed objects from hooks (not tuples)
- Use refs for values accessed in callbacks (avoid stale closures)
- Cleanup functions in useEffect returns
- Debug logging via localStorage flag: `localStorage.getItem('xnet:sync:debug')`

## Testing

Tests use Vitest with this structure:

```typescript
import { describe, it, expect } from 'vitest'

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should do expected behavior', () => {
      // Arrange
      const input = createTestData()

      // Act
      const result = functionName(input)

      // Assert
      expect(result).toBe(expected)
    })
  })
})
```

# Playwright MCP Usage Guide

- **playwright-electron**: Connects to existing Electron/Chromium instance via CDP.
  Launch Electron first with: --remote-debugging-port=9223
  Use when: Automating desktop Electron apps.

- **playwright-web**: Auto-launches a new browser (default Chromium).
  Use when: Web apps, websites.
  Do NOT add --cdp-endpoint.

### Key tools

- `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`
- `browser_console_messages` - check for JS errors, React warnings, unhandled rejections

### Workflow

navigate → snapshot (accessibility tree) → interact → screenshot → check console.
Enable sync debug logs: `localStorage.setItem('xnet:sync:debug', 'true')`

### Test Authentication Bypass

**CRITICAL: All Playwright tests MUST use test bypass mode.** The app requires WebAuthn/passkey authentication, which is not available in automated browsers.

```typescript
import { setupTestAuth } from '../helpers/test-auth'

test('my test', async ({ page }) => {
  await setupTestAuth(page) // Enables bypass and waits for auth
  // Now interact with authenticated app
})
```

**How it works:**

1. Sets `localStorage.setItem('xnet:test:bypass', 'true')` before page load
2. Identity manager detects flag and creates deterministic test identity
3. No WebAuthn prompt, instant authentication

**Manual testing with bypass:**

```javascript
// In browser console before loading app:
localStorage.setItem('xnet:test:bypass', 'true')
// Then reload page - app will skip Touch ID
```

**IMPORTANT: Always kill dev servers when done.** After finishing any Playwright testing or dev server usage, shut down ALL background processes before ending:

```bash
# Kill servers on known ports
lsof -ti:5177,4444,3000,8080 2>/dev/null | xargs kill -9 2>/dev/null
# Kill by process name
pkill -f "vite" 2>/dev/null; pkill -f "electron" 2>/dev/null; pkill -f "signaling" 2>/dev/null
# Verify nothing is left running
lsof -ti:5177,4444,3000,8080 2>/dev/null || echo "All ports clear"
```

Never leave background servers running between tasks or at end of session.

## Git Hooks (Pre-commit Quality Gates)

This repo uses **husky** for git hooks. They run automatically on every commit/push.

### What Runs on Every Commit (~10-15s)

| Hook       | What Runs                                                | Time |
| ---------- | -------------------------------------------------------- | ---- |
| Pre-commit | `lint-staged` (eslint --fix + prettier + vitest related) | 5-8s |
| Pre-commit | `turbo typecheck --affected`                             | 3-5s |
| Pre-commit | `vitest run --changed HEAD --passWithNoTests`            | 5-8s |
| Commit-msg | `commitlint` (conventional commits)                      | <1s  |

### What Runs on Every Push (~30s)

| Hook     | What Runs                     | Time |
| -------- | ----------------------------- | ---- |
| Pre-push | `pnpm typecheck && pnpm test` | ~30s |

### Commit Message Format

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

# Examples:
feat(sync): add peer scoring for Yjs updates
fix(data): handle null schema in NodeStore
refactor(canvas): extract spatial index to separate module
test(identity): add WebAuthn emulator tests
docs(exploration): add pre-commit quality gates plan
ci: harden CI with frozen-lockfile
chore: update dependencies
```

### Bypassing Hooks (Emergency Only)

```bash
# Skip all hooks
git commit --no-verify -m "fix: emergency hotfix"
git push --no-verify
```

Only use `--no-verify` when hooks are genuinely broken or blocking an emergency fix. CI will still catch issues.

### If a Hook Fails

- **ESLint error**: Fix the lint issue. The hook auto-fixes what it can.
- **Type error**: Run `pnpm typecheck` to see full error. Fix the type issue.
- **Test failure**: Run `pnpm test` to see which test failed. Fix or update the test.
- **Commitlint error**: Reformat your commit message to `type(scope): description`.
- **Lockfile drift**: Run `pnpm install` and stage `pnpm-lock.yaml`.

## Key Constraints

**DO:**

- Read code before making assumptions (grep, don't guess)
- Write unit tests for core packages
- Use existing patterns from similar code
- Keep changes minimal and focused
- Prefer Tailwind over custom CSS
- Integrate new features into the Electron app first, before bothering with Web or Expo
- Test UI changes in Electron with Playwright after implementing (start dev server, verify it works)
- Always kill dev servers when done testing — never leave background processes running
- Use `Claude.json` and not any `claude.json` for config like MCP
- Save Playwright screenshots to `tmp/playwright/` (e.g., `tmp/playwright/my-screenshot.png`)

**DON'T:**

- Add features beyond what's requested
- Write UI tests (manual testing only)
- Use heavyweight frameworks
- Store computed values (formula, rollup) - compute at read
- Skip tests for core packages
- Test electron in a browser. Only test electron with `playright-electron` MCP over CDP.
- NEVER use `--no-verify` to bypass git hooks. If tests fail, fix them. Hooks exist to prevent broken code from being pushed.

## Sync Architecture

| Data Type  | Sync Mechanism | Conflict Resolution       |
| ---------- | -------------- | ------------------------- |
| Rich text  | Yjs CRDT       | Character-level merge     |
| Structured | NodeStore      | Field-level LWW (Lamport) |

Yjs updates are signed with Ed25519 and verified before applying.
Rate limiting and peer scoring protect against abuse.

## Package Dependencies

```
crypto → identity → storage → sync → data → react → sdk
                                ↓
                            network → query
```

Lower packages cannot import from higher ones.
