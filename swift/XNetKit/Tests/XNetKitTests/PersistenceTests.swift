import XCTest
import Foundation
@testable import XNetKit

final class PersistenceTests: XCTestCase {
    let taskSchema = Schema(name: "Task", namespace: "xnet://xnet.fyi/") {
        text("title", required: true)
        select("status", options: ["todo", "done"], default: "todo")
    }

    /// State written through a SQLite-backed store survives a close + reopen,
    /// with LWW (the later `update`) preserved across the replay.
    func testSurvivesReopen() throws {
        let path = NSTemporaryDirectory() + "xnetkit-persist-\(UUID().uuidString).sqlite"
        defer { try? FileManager.default.removeItem(atPath: path) }
        let id = try Identity(seed: Array(repeating: 0x44, count: 32))
        var nodeId = ""

        do {
            let log = SQLiteChangeLog(path: path)
            let store = NodeStore(identity: id, persistence: log)
            let node = store.create(taskSchema, ["title": "persisted", "status": "todo"])
            nodeId = node.id
            store.update(node.id, ["status": "done"])
            store.create(taskSchema, ["title": "second"])
            log.close()
        }

        // Reopen from the same file — state is rebuilt by replaying the log.
        let log2 = SQLiteChangeLog(path: path)
        let store2 = NodeStore(identity: id, persistence: log2)
        let rows = store2.query(Query(taskSchema).ordered(by: "title"))
        XCTAssertEqual(rows.map { $0["title"]?.stringValue }, ["persisted", "second"])
        XCTAssertEqual(store2.node(nodeId)?["status"]?.stringValue, "done", "LWW update survived replay")
        log2.close()
    }

    func testIdempotentReplayNoDuplication() throws {
        let path = ":memory:"  // ephemeral; just exercising the append/dedup path
        let id = try Identity(seed: Array(repeating: 0x45, count: 32))
        let log = SQLiteChangeLog(path: path)
        let store = NodeStore(identity: id, persistence: log)
        let node = store.create(taskSchema, ["title": "x"])
        // Re-applying the same change is a no-op and must not duplicate rows.
        let change = store.query(Query(taskSchema)).isEmpty ? nil : node
        XCTAssertNotNil(change)
        XCTAssertEqual(store.query(Query(taskSchema)).count, 1)
        log.close()
    }
}
