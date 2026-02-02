# AGENTS.md - Coding Agent Guidelines

Reference for AI coding agents working in the xNet monorepo.

## Build & Test Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests (~350 tests)
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

## Playwright MCP (Browser Automation)

Debug the Electron app at `http://localhost:5177` when dev server is running (`cd apps/electron && pnpm dev`).

### Key tools

- `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`
- `browser_console_messages` - check for JS errors, React warnings, unhandled rejections

### Workflow

navigate → snapshot (accessibility tree) → interact → screenshot → check console.
Enable sync debug logs: `localStorage.setItem('xnet:sync:debug', 'true')`

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

**DON'T:**

- Add features beyond what's requested
- Write UI tests (manual testing only)
- Use heavyweight frameworks
- Store computed values (formula, rollup) - compute at read
- Skip tests for core packages
- - Test electron in a browser. Only test electron in electron.
- Don't open browsers like chrome to check if servers are running

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
