import Foundation
import XNetKit

// Live end-to-end interop proof against a running xNet hub (TypeScript):
//   1. catch-up: a Swift writer publishes a signed change; a second Swift client
//      catches it up via node-sync-request and materializes the node.
//   2. streaming: the reader subscribes and receives a *live* relayed update the
//      moment the writer publishes it.
//
//   swift run xnet-sync-demo [ws://host:port] [room]
//
// Run an anonymous hub first:  node packages/hub/dist/cli.js --no-auth --port 31999

/// One-shot, thread-safe continuation holder for the streaming await.
final class Once<T>: @unchecked Sendable {
    private var cont: CheckedContinuation<T, Error>?
    private let lock = NSLock()
    init(_ c: CheckedContinuation<T, Error>) { cont = c }
    func resume(returning v: T) { lock.lock(); defer { lock.unlock() }; cont?.resume(returning: v); cont = nil }
    func resume(throwing e: Error) { lock.lock(); defer { lock.unlock() }; cont?.resume(throwing: e); cont = nil }
}
struct DemoError: Error { let message: String }

let wsURL = CommandLine.arguments.dropFirst().first ?? "ws://localhost:31999"
let room = CommandLine.arguments.dropFirst(2).first ?? "swift-interop-demo"
guard let url = URL(string: wsURL) else { fatalError("bad ws url: \(wsURL)") }

let TaskSchema = Schema(name: "Task", namespace: "xnet://xnet.fyi/") {
    text("title", required: true)
    select("status", options: ["todo", "done"], default: "todo")
}

// ── Writer: create a node, publish its signed change to the hub ──
let alice = try Identity(seed: Array(repeating: 0xaa, count: 32))
let writer = NodeStore(identity: alice)
let writerConn = HubConnection(url: url, did: alice.did)
try await writerConn.connect()
print("→ writer connected to \(wsURL) as \(alice.did)")

var outbound: [Change] = []
writer.onLocalChange = { outbound.append($0) }
let node = writer.create(TaskSchema, ["title": "Sync from native Swift", "status": "todo"])
for change in outbound { try await writerConn.publish(change, room: room) }
print("→ created node \(node.id) and published its signed change")

// ── Reader: a DIFFERENT identity catches up from the hub ──
let bob = try Identity(seed: Array(repeating: 0x0b, count: 32))
let reader = NodeStore(identity: bob)
let readerConn = HubConnection(url: url, did: bob.did)
try await readerConn.connect()
let incoming = try await readerConn.syncRequest(room: room, sinceLamport: 0)
for change in incoming { _ = reader.apply(change) }
guard let caughtUp = reader.node(node.id) else {
    print("❌ catch-up failed: reader did not materialize node \(node.id)")
    exit(1)
}
print("✅ CATCH-UP OK — reader sees: title=\(caughtUp["title"]?.stringValue ?? "?")")

// ── Streaming: reader subscribes; writer publishes a live update ──
readerConn.onRemoteChange = { change in
    _ = reader.apply(change)
}
try await readerConn.subscribe(room: room)
readerConn.startStreaming()

let liveTitle = "Updated live from Swift"
let received: String = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
    let once = Once(cont)
    // Layer a one-shot signal on top of the apply handler set above.
    readerConn.onRemoteChange = { change in
        _ = reader.apply(change)
        if change.payload.nodeId == node.id,
           let t = reader.node(node.id)?["title"]?.stringValue, t == liveTitle {
            once.resume(returning: t)
        }
    }
    // Fail loud instead of hanging if the relay never arrives.
    Task {
        try? await Task.sleep(nanoseconds: 6_000_000_000)
        once.resume(throwing: DemoError(message: "timed out waiting for live relay"))
    }
    // Give the hub a moment to register the subscription, then publish the update.
    Task {
        try? await Task.sleep(nanoseconds: 300_000_000)
        writer.onLocalChange = { change in Task { try? await writerConn.publish(change, room: room) } }
        _ = writer.update(node.id, ["title": .string(liveTitle)])
    }
}

print("✅ STREAMING OK — reader received a live relayed update: title=\(received)")
print("\n   A second native-Swift client saw a hub-relayed change in real time —")
print("   end-to-end live sync against the TypeScript hub.")
writerConn.close()
readerConn.close()
