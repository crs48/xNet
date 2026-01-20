# xNet Implementation Plan v2

> AI-agent-actionable implementation guide

## Implementation Order

Execute these documents in order. Each builds on the previous.

| # | Document | Description | Est. Time | Status |
|---|----------|-------------|-----------|--------|
| 00 | [Monorepo Setup](./00-monorepo-setup.md) | Project structure, tooling, CI | 1 day | ✅ |
| 01 | [Phase 0: Foundations](./01-phase0-foundations.md) | Content addressing, snapshots, signing | 4 weeks | ✅ |
| 02 | [@xnet/crypto](./02-xnet-crypto.md) | Encryption, signing, hashing | 2 weeks | ✅ |
| 03 | [@xnet/identity](./03-xnet-identity.md) | DID:key, UCAN, key management | 3 weeks | ✅ |
| 04 | [@xnet/storage](./04-xnet-storage.md) | IndexedDB, SQLite, snapshots | 2 weeks | ✅ |
| 05 | [@xnet/data](./05-xnet-data.md) | Yjs CRDT, signed updates | 4 weeks | ✅ |
| 06 | [@xnet/network](./06-xnet-network.md) | libp2p, WebRTC, sync | 3 weeks | ✅ |
| 07 | [@xnet/query](./07-xnet-query.md) | Local + federated queries | 2 weeks | ✅ |
| 08 | [@xnet/react](./08-xnet-react.md) | React hooks | 2 weeks | ✅ |
| 09 | [@xnet/sdk](./09-xnet-sdk.md) | Unified SDK bundle | 1 week | ✅ |
| 10 | [Platform: Electron](./10-platform-electron.md) | macOS desktop app | 2 weeks | ✅ |
| 11 | [Platform: Expo](./11-platform-expo.md) | iOS mobile app | 2 weeks | ✅ |
| 12 | [Platform: Web](./12-platform-web.md) | TanStack PWA | 2 weeks | |
| 13 | [xNotes Features](./13-xnotes-features.md) | Wiki, tasks, editor | 6 weeks | |
| 14 | [Testing Strategy](./14-testing-strategy.md) | Unit tests, integration | Reference | |
| 15 | [Infrastructure](./15-infrastructure.md) | Signaling, relay, bootstrap | 3 weeks | |
| 16 | [Timeline](./16-timeline.md) | Development timeline, schedules, milestones | Reference | |
| 17 | [Next Steps](./17-next-steps.md) | Future vision: Database UI, ERP, Federation, Tokens | Reference | |

## Validation Gates

Before proceeding to the next phase, verify:

### After Phase 0
- [x] Content hashing works (BLAKE3)
- [x] Snapshots load in <100ms
- [x] Signed updates verify correctly
- [x] All foundation tests pass (42 tests in @xnet/core)

### After Core Packages
- [x] Can create identity locally
- [x] Can encrypt/decrypt data
- [x] Can persist to IndexedDB/SQLite
- [x] CRDT operations work
- [x] All package tests pass (>80% coverage)

**Test Summary:**
- @xnet/core: 42 tests
- @xnet/crypto: 71 tests
- @xnet/identity: 30 tests
- @xnet/storage: 22 tests
- @xnet/data: 16 tests
- @xnet/network: 5 tests
- @xnet/query: 23 tests
- @xnet/react: 16 tests
- @xnet/sdk: 13 tests
- **Total: 238 tests**

### After Platform POCs
- [x] Electron app launches on macOS
- [x] Expo app runs on iOS simulator
- [ ] PWA loads in browser
- [ ] Data persists across restarts
- [ ] Basic P2P sync works

### After Features
- [ ] Can create/edit pages
- [ ] Can link pages (wikilinks)
- [ ] Can create tasks
- [ ] Search returns results
- [ ] Sync works between devices

## Quick Reference

### Package Dependencies
```
crypto ──┬──> identity ──┬──> data ──> network ──> query
         │               │      ↑
         └───────────────┴──> storage
```

### Key Types
```typescript
ContentId = `cid:blake3:${string}`
DID = `did:key:${string}`
DocumentPath = `xnet://${DID}/workspace/${string}/doc/${string}`
```

### Test Commands
```bash
pnpm test                    # All tests
pnpm --filter @xnet/crypto test  # Single package
pnpm test:coverage           # With coverage
```
