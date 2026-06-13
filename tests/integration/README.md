# @xnetjs/integration-tests

Integration tests for xNet sync, CRUD, and persistence.

These run in [Vitest](https://vitest.dev/)'s browser mode (Playwright-backed) and exercise multiple packages wired together — CRDT sync, WebRTC signaling, document collaboration, CRUD, and global undo — rather than any single unit in isolation.

## Running

```bash
pnpm --filter @xnetjs/integration-tests test         # run once
pnpm --filter @xnetjs/integration-tests test:watch    # watch mode
pnpm --filter @xnetjs/integration-tests test:headed    # headed browser
```

## Suites

| File                           | Covers                        |
| ------------------------------ | ----------------------------- |
| `src/sync.test.ts`             | CRDT / document sync          |
| `src/document-sync.test.tsx`   | Collaborative document sync   |
| `src/crud.test.tsx`            | Node CRUD over the data layer |
| `src/global-undo.test.tsx`     | App-wide undo                 |
| `src/webrtc-signaling.test.ts` | WebRTC peer signaling         |

Tests run against the real `@xnetjs/data`, `@xnetjs/crypto`, `@xnetjs/identity`, and `@xnetjs/react` packages with Yjs / y-webrtc.
