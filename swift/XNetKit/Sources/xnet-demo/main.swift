import XNetKit

// A headless walkthrough of the native-Swift xNet experience: define schemas in
// Swift, write and query the database in Swift, and observe a reactive query —
// no JavaScript, no React. Run with `swift run xnet-demo`.

print("XNetKit \(XNetKit.version) — protocol \(XNetKit.protocolVersion)\n")

// 1) Identity — an Ed25519 did:key (would live in the Keychain in an app).
let me = try Identity(seed: Array(repeating: 0xaa, count: 32))
print("identity: \(me.did)\n")

// 2) Define a schema in Swift (the analogue of TS `defineSchema`).
let Task = Schema(name: "Task", namespace: "xnet://xnet.fyi/",
                  authorization: .spaceCascade(relation: "space")) {
    text("title", required: true, maxLength: 200)
    select("status", options: ["todo", "doing", "done"], default: "todo")
    relation("space", target: "xnet://xnet.fyi/Space@1.0.0")
    money("bounty", currency: "USD")
}
print("schema id: \(Task.id)")               // xnet://xnet.fyi/Task@1.0.0
print("properties: \(Task.properties.map(\.name).joined(separator: ", "))\n")

// 3) A local store, owned by `me`.
let store = NodeStore(identity: me)

// 4) Observe a live query BEFORE any data — it should fire immediately, then on
//    every change (the native re-render loop; SwiftUI would use LiveQueryModel).
var renders = 0
let todo = LiveQuery(store, Query(Task, where: .equals("status", "todo")).ordered(by: "title"))
let sub = todo.subscribe { rows in
    renders += 1
    let titles = rows.compactMap { $0["title"]?.stringValue }
    print("  ↻ render #\(renders): todo = \(titles)")
}

// 5) Write the database in Swift. Each call signs a Change and folds it via LWW.
print("create + update:")
let ship = store.create(Task, ["title": "Ship the Swift SDK", "status": "todo"])
let docs = store.create(Task, ["title": "Write the docs", "status": "todo"])
store.update(ship.id, ["status": "doing"])   // leaves the `todo` query

// 6) Query the database in Swift.
print("\nquery — all tasks:")
for node in store.query(Query(Task).ordered(by: "title")) {
    let title = node["title"]?.stringValue ?? "?"
    let status = node["status"]?.stringValue ?? "?"
    print("  • \(title) [\(status)]  (signed by \(String(node.createdBy.suffix(8))))")
}

// 7) Convergence: apply a concurrent change from another author. Per-property
//    LWW means the higher (lamport, wallTime, author) wins, deterministically.
print("\nLWW convergence:")
let peer = try Identity(seed: Array(repeating: 0x01, count: 32))
let concurrent = Change.create(
    id: NodeStore.newId(),
    payload: NodePayload(nodeId: docs.id, properties: ["title": "Write the docs (peer edit)"]),
    parentHash: nil, wallTime: 9_999_999, lamport: 99, by: peer
)
print("  peer change verifies under XNetKit: \(concurrent.verify())")
store.apply(concurrent)
print("  converged title: \(store.node(docs.id)?["title"]?.stringValue ?? "?")")

// 8) Tear down the subscription.
sub.cancel()
print("\ntotal reactive renders: \(renders)")
print("done.")
