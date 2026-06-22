import Foundation
import XNetKit

// Live end-to-end interop proof: a Swift writer creates and signs a change,
// publishes it to a running XNet hub (TypeScript), and a SECOND Swift client
// (different identity) catches it up from the hub and materializes the node.
//
//   swift run xnet-sync-demo [ws://host:port] [room]
//
// Run an anonymous hub first:  node packages/hub/dist/cli.js --no-auth --port 31999

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
var outbound: [Change] = []
writer.onLocalChange = { outbound.append($0) }

let conn = HubConnection(url: url, did: alice.did)
try await conn.connect()
print("→ connected to \(wsURL) as \(alice.did)")

let node = writer.create(TaskSchema, ["title": "Sync from native Swift", "status": "todo"])
print("→ created node \(node.id) (\(outbound.count) signed change)")
for change in outbound { try await conn.publish(change, room: room) }
print("→ published to room '\(room)' — the hub verifies hash + Ed25519 signature")

// ── Reader: a DIFFERENT identity catches up from the hub ──
let bob = try Identity(seed: Array(repeating: 0x0b, count: 32))
let reader = NodeStore(identity: bob)
let conn2 = HubConnection(url: url, did: bob.did)
try await conn2.connect()
let incoming = try await conn2.syncRequest(room: room, sinceLamport: 0)
print("← hub returned \(incoming.count) change(s) for the room")

var applied = 0
for change in incoming where reader.apply(change) { applied += 1 }
print("← reader verified + applied \(applied) change(s)")

if let seen = reader.node(node.id) {
    print("\n✅ ROUND-TRIP OK")
    print("   reader sees: title=\(seen["title"]?.stringValue ?? "?") status=\(seen["status"]?.stringValue ?? "?")")
    print("   A Swift-signed, integer-lamport change was accepted, hashed, and stored by")
    print("   the TypeScript hub, then re-verified by a second native Swift client.")
} else {
    print("\n❌ reader did not materialize node \(node.id)")
    conn.close(); conn2.close()
    exit(1)
}
conn.close()
conn2.close()
