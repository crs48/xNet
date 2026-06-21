import XCTest
@testable import XNetKit

final class LiveQueryTests: XCTestCase {
    let taskSchema = Schema(name: "Task", namespace: "xnet://xnet.fyi/") {
        text("title", required: true)
        select("status", options: ["todo", "done"], default: "todo")
    }

    func testFiresImmediatelyAndOnChange() throws {
        var counter: Int64 = 0
        let store = NodeStore(identity: try Identity(seed: Array(repeating: 0x09, count: 32)),
                              now: { counter += 1; return counter })
        let live = LiveQuery(store, Query(taskSchema, where: .equals("status", "todo")).ordered(by: "title"))

        var snapshots: [[String]] = []
        let sub = live.subscribe { rows in
            snapshots.append(rows.compactMap { $0["title"]?.stringValue })
        }

        XCTAssertEqual(snapshots, [[]])               // fired immediately, empty
        store.create(taskSchema, ["title": "one", "status": "todo"])
        store.create(taskSchema, ["title": "two", "status": "done"])  // excluded by predicate

        XCTAssertEqual(snapshots, [[], ["one"], ["one"]])

        // After cancelling, no further updates arrive.
        sub.cancel()
        store.create(taskSchema, ["title": "three", "status": "todo"])
        XCTAssertEqual(snapshots.count, 3)
    }

    func testLastSubscriberTearsDownStoreSubscription() throws {
        let store = NodeStore(identity: try Identity(seed: Array(repeating: 0x0a, count: 32)))
        let live = LiveQuery(store, Query(taskSchema))
        var aCount = 0, bCount = 0
        let a = live.subscribe { _ in aCount += 1 }
        let b = live.subscribe { _ in bCount += 1 }
        store.create(taskSchema, ["title": "x"])
        XCTAssertEqual(aCount, 2)  // immediate + change
        XCTAssertEqual(bCount, 2)
        a.cancel(); b.cancel()
        store.create(taskSchema, ["title": "y"])
        XCTAssertEqual(aCount, 2)  // no more deliveries
        XCTAssertEqual(bCount, 2)
    }
}
