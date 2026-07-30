# XNetKit

A **native Swift SDK** for xNet's local-first graph database. Define schemas in
Swift, write and query the database in Swift, and bind results into a SwiftUI
re-rendering loop — no JavaScript, no React. Built directly on the
conformance-pinned protocol kernel, so it interoperates with the TypeScript
reference byte-for-byte where it matters (identity, canonical change hashes, LWW
convergence).

This is the runnable realization of [exploration 0210](../../docs/explorations/0210_%5B_%5D_NATIVE_SWIFT_SDK_AND_PORTABLE_MULTI_LANGUAGE_CORE.md)'s
user-facing vision. See **Scope & status** below for what this slice does and
doesn't cover.

## Quick look

```swift
import XNetKit

// Identity — an Ed25519 did:key (would live in the Keychain in a real app).
let me = Identity()

// Define a schema in Swift (the analogue of TS `defineSchema`).
let Task = Schema(name: "Task", namespace: "xnet://xnet.fyi/",
                  authorization: .spaceCascade(relation: "space")) {
    text("title", required: true, maxLength: 200)
    select("status", options: ["todo", "doing", "done"], default: "todo")
    relation("space", target: "xnet://xnet.fyi/Space@1.0.0")
    money("bounty", currency: "USD")
}
Task.id   // "xnet://xnet.fyi/Task@1.0.0"

// A local store, owned by `me`. Every write signs a Change and folds it via LWW.
// Pass a SQLiteChangeLog to persist — state is replayed from it on next launch.
let store = NodeStore(identity: me, persistence: SQLiteChangeLog(path: dbPath))
let task = store.create(Task, ["title": "Ship the Swift SDK", "status": "todo"])
store.update(task.id, ["status": "doing"])

// Query the database in Swift.
let todo = store.query(Query(Task, where: .equals("status", "todo")).ordered(by: "title"))
```

### The native re-render loop (SwiftUI)

`LiveQueryModel` is an `@Observable` analogue of React's `useQuery`: a SwiftUI
view reads `model.rows` and re-renders automatically whenever the result
changes — no hooks, no manual subscriptions.

```swift
import SwiftUI
import XNetKit

struct TaskListView: View {
    @State private var model: LiveQueryModel

    init(store: NodeStore, schema: Schema) {
        _model = State(initialValue: LiveQueryModel(
            store, Query(schema, where: .equals("status", "todo")).ordered(by: "title")))
    }

    var body: some View {
        List(model.rows) { node in
            Text(node["title"]?.stringValue ?? "")
        }
    }
}
```

Headless, the same reactivity is the framework-agnostic `LiveQuery`
(`subscribe(_:)` fires immediately and on every change — a 1:1 port of
`packages/runtime/src/live-query.ts`).

### Live sync with an xNet hub

`HubConnection` speaks the L2 replication wire protocol
([`03-replication.md`](../../docs/specs/protocol/03-replication.md)) over a
WebSocket: version handshake, room subscribe, `node-change` publish, and
`node-sync-request`/`-response` catch-up. Point a store's `onLocalChange` at it
to publish writes, and apply caught-up changes back into the store:

```swift
let conn = HubConnection(url: URL(string: "wss://hub.xnet.app")!, did: identity.did)
try await conn.connect()
store.onLocalChange = { change in Task { try await conn.publish(change, room: docId) } }

// catch up on what we missed:
for change in try await conn.syncRequest(room: docId, sinceLamport: 0) {
    store.apply(change)   // verifies hash + signature before applying
}

// then stream peers' changes in real time:
conn.onRemoteChange = { change in store.apply(change) }
try await conn.subscribe(room: docId)
conn.startStreaming()
```

This is **proven against the real TypeScript hub**: `xnet-sync-demo` has a Swift
client sign a change and publish it to the hub (which verifies the hash + Ed25519
signature and stores it), a second Swift client catch it up and materialize the
node, and that second client then receive a **live relayed update** the moment
the writer publishes it — a true cross-language, real-time round-trip.

## Run it

```bash
cd swift/XNetKit
swift run xnet-demo     # headless walkthrough: schema → writes → query → reactive loop
swift test              # 18 tests incl. golden vectors, wire codec, persistence

# live interop against a local hub (from the repo root, in another shell):
#   node packages/hub/dist/cli.js --no-auth --port 31999
swift run xnet-sync-demo ws://localhost:31999 my-room
```

`swift run xnet-demo` prints identity → schema → signed writes → query →
reactive renders → LWW convergence. `xnet-sync-demo` prints a live Swift↔hub
catch-up **and** a real-time streamed update. Verified with Swift 6.3 on macOS
against the reference hub.

## Architecture

| Layer | File | Role |
| --- | --- | --- |
| Values | `JSONValue.swift` | Deterministic, `Sendable` JSON + canonical serialization (matches the protocol's [L1 §6](../../docs/specs/protocol/02-data-model.md) byte contract) |
| Crypto | `Crypto.swift` | BLAKE3 (via `nixberg/blake3-swift`), base58btc, hex |
| Identity | `Identity.swift` | `did:key` + Ed25519 (CryptoKit) sign/verify |
| Change log | `Change.swift` | Signed, hash-chained change records |
| Convergence | `Node.swift` | `NodeState` + per-property LWW fold (matches `conformance/vectors/lww`) |
| Schema DSL | `Schema.swift` | `Schema { … }` result builder → the same `SchemaIRI` + property set as TS `defineSchema` |
| Store | `NodeStore.swift` | Local store: sign writes, materialize via LWW, query, subscribe |
| Query | `Query.swift` | `Sendable` `Predicate` enum + fluent `Query` |
| Reactivity | `LiveQuery.swift` | `LiveQuery` (subscribe/unsubscribe) and `@Observable LiveQueryModel` |
| Sync | `HubConnection.swift` | `URLSessionWebSocketTask` L2 client + `WireCodec` (Change ↔ the hub's `SerializedNodeChange`) — proven against the TS hub |
| Persistence | `Persistence.swift` | `SQLiteChangeLog` (system SQLite) — durable change log; the store replays it on open so state survives restarts |

## Scope & status

This is **Phase 1** of exploration 0210 — it proves the authoring experience
the exploration recommends, now with **live hub sync** (catch-up *and* real-time
streaming) demonstrated end-to-end against the reference TypeScript hub. It
deliberately does **not** yet include:

- **Awareness / presence.** `HubConnection` streams relayed `node-change`s in
  real time (`subscribe` + `startStreaming`), but does not yet handle
  awareness/presence (cursors, online status) or the Yjs document-body codec.
- **Collaborative document bodies (Yjs).** Node properties only; rich-text CRDT
  bodies are out of scope for this slice (and intentionally opaque in the
  protocol — see [L1 §8](../../docs/specs/protocol/02-data-model.md)).
- **Persistent storage.** In-memory only; a GRDB/SQLite adapter matching
  `packages/sqlite/src/schema.ts` is a follow-up.
- **The full authorization engine.** `Authorization` ships the common presets
  and records them on the schema; the role/expression evaluator (pinned by
  `conformance/vectors/authz`) is not yet enforced client-side.
- **Swift 6 strict concurrency.** The package builds in Swift 5 language mode;
  `NodeStore`/`LiveQuery`/`Cancellable` are single-threaded (use from one
  isolation domain, e.g. the main actor in a SwiftUI app). An `actor`-based
  refactor is a clean follow-up.
- **Byte-exact canonicalization covers the integer-valued numeric surface.**
  Object keys now sort by UTF-16 code unit (matching JS) and integer-valued
  numbers (incl. money minor units) serialize exactly. Arbitrary *fractional*
  doubles needing exponential notation are not yet guaranteed byte-identical to
  JS `Number::toString` (a Ryu/Grisu port is the fix) — xNet's hashed numeric
  fields are integer-valued, so this is an edge, not the common path.

### A known Apple-platform constraint

Apple's CryptoKit `Curve25519.Signing` uses **randomized nonces**, so XNetKit
*verifies* TypeScript-signed changes but does **not** reproduce a specific
signature byte-for-byte (unlike a deterministic RFC-8032 signer). This is fine
for interop — you verify others' signatures and emit your own valid ones — and
is documented in `conformance/reference/swift`.

## Dependencies

- **CryptoKit** (system) — Ed25519.
- [`nixberg/blake3-swift`](https://github.com/nixberg/blake3-swift) — BLAKE3
  (CryptoKit has none).

Platforms: macOS 14+, iOS 17+, visionOS 1+ (the Observation framework).
