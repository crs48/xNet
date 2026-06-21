import XCTest
@testable import XNetKit

final class StoreTests: XCTestCase {
    let taskSchema = Schema(name: "Task", namespace: "xnet://xnet.fyi/") {
        text("title", required: true)
        select("status", options: ["todo", "doing", "done"], default: "todo")
    }

    func makeStore(seed: UInt8 = 0x07) throws -> NodeStore {
        var counter: Int64 = 0
        return NodeStore(identity: try Identity(seed: Array(repeating: seed, count: 32)),
                         now: { counter += 1; return counter })
    }

    func testSchemaIRI() {
        XCTAssertEqual(taskSchema.id, "xnet://xnet.fyi/Task@1.0.0")
        XCTAssertEqual(taskSchema.propertyIRI("title"), "xnet://xnet.fyi/Task#title")
    }

    func testCreateQueryUpdate() throws {
        let store = try makeStore()
        store.create(taskSchema, ["title": "B", "status": "todo"])
        store.create(taskSchema, ["title": "A", "status": "todo"])

        let ordered = store.query(Query(taskSchema).ordered(by: "title"))
        XCTAssertEqual(ordered.map { $0["title"]?.stringValue }, ["A", "B"])

        let todo = store.query(Query(taskSchema, where: .equals("status", "todo")))
        XCTAssertEqual(todo.count, 2)

        // Update one out of the todo set.
        let a = ordered[0]
        store.update(a.id, ["status": "doing"])
        XCTAssertEqual(store.query(Query(taskSchema, where: .equals("status", "todo"))).count, 1)
        XCTAssertEqual(store.node(a.id)?["status"]?.stringValue, "doing")
    }

    func testSoftDeleteAndIdempotency() throws {
        let store = try makeStore()
        let n = store.create(taskSchema, ["title": "X"])
        XCTAssertNotNil(store.node(n.id))
        store.delete(n.id)
        XCTAssertNil(store.node(n.id))
        XCTAssertTrue(store.query(Query(taskSchema)).isEmpty)

        // Re-applying a change is a no-op (idempotent by hash).
        let change = Change.create(
            id: "c1", payload: NodePayload(nodeId: "n2", schemaId: taskSchema.id, properties: ["title": "Y"]),
            parentHash: nil, wallTime: 1, lamport: 1, by: store.identity
        )
        XCTAssertTrue(store.apply(change))
        XCTAssertTrue(store.apply(change))  // idempotent
        XCTAssertEqual(store.query(Query(taskSchema, where: .equals("title", "Y"))).count, 1)
    }

    /// Two authors edit different properties of the same node concurrently;
    /// applying the changes in either order converges to the same state.
    func testLWWConvergenceOrderIndependent() throws {
        let a = try Identity(seed: Array(repeating: 0xaa, count: 32))
        let b = try Identity(seed: Array(repeating: 0x01, count: 32))
        let nodeId = "shared"
        let first = Change.create(
            id: "a1", payload: NodePayload(nodeId: nodeId, schemaId: taskSchema.id, properties: ["title": "A"]),
            parentHash: nil, wallTime: 100, lamport: 1, by: a)
        let second = Change.create(
            id: "b1", payload: NodePayload(nodeId: nodeId, properties: ["status": "doing"]),
            parentHash: nil, wallTime: 100, lamport: 1, by: b)

        let s1 = NodeStore(identity: a); s1.apply(first); s1.apply(second)
        let s2 = NodeStore(identity: a); s2.apply(second); s2.apply(first)

        XCTAssertEqual(s1.node(nodeId)?.properties, s2.node(nodeId)?.properties)
        XCTAssertEqual(s1.node(nodeId)?["title"]?.stringValue, "A")
        XCTAssertEqual(s1.node(nodeId)?["status"]?.stringValue, "doing")
    }

    func testRejectsTamperedChange() throws {
        let store = try makeStore()
        var bad = Change.create(
            id: "c", payload: NodePayload(nodeId: "n", schemaId: taskSchema.id, properties: ["title": "ok"]),
            parentHash: nil, wallTime: 1, lamport: 1, by: store.identity)
        bad.payload.properties["title"] = "tampered"  // hash no longer matches
        XCTAssertFalse(bad.verify())
        XCTAssertFalse(store.apply(bad))
    }
}
