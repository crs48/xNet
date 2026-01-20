# @xnet packages

Core SDK packages for the xNet decentralized infrastructure.

## Packages

| Package | Description |
|---------|-------------|
| [@xnet/core](./core) | Types, schemas, content addressing |
| [@xnet/crypto](./crypto) | Encryption, signing, hashing |
| [@xnet/identity](./identity) | DID:key, UCAN tokens |
| [@xnet/storage](./storage) | IndexedDB/SQLite adapters |
| [@xnet/data](./data) | Yjs CRDT engine |
| [@xnet/network](./network) | libp2p, WebRTC, P2P sync |
| [@xnet/query](./query) | Local + federated queries |
| [@xnet/react](./react) | React hooks |
| [@xnet/sdk](./sdk) | Unified SDK bundle |

## Build Order

```
crypto ──┬──> identity ──┬──> data ──> network ──> query
         │               │      ↑
         └───────────────┴──> storage
```

## Development

```bash
# Build all packages
pnpm build

# Test all packages
pnpm test

# Test single package
pnpm --filter @xnet/crypto test
```
