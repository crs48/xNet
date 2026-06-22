import XCTest
import Foundation
@testable import XNetKit

final class WireCodecTests: XCTestCase {
    /// A change serialized to the hub's wire shape, pushed through a real JSON
    /// encode/decode (what crosses the socket), must deserialize back to an
    /// equivalent change that still verifies.
    func testWireRoundTrip() throws {
        let id = try Identity(seed: Array(repeating: 0x33, count: 32))
        let change = Change.create(
            id: "c1",
            payload: NodePayload(
                nodeId: "n1",
                schemaId: "xnet://xnet.fyi/Task@1.0.0",
                properties: ["title": "hi", "count": 5, "done": .bool(true)]
            ),
            parentHash: nil, wallTime: 1_718_641_200_000, lamport: 1, by: id
        )

        let wire = WireCodec.serialize(change, room: "room1")
        // Flat fields match the hub's SerializedNodeChange shape.
        XCTAssertEqual(wire["lamportTime"] as? Int64, 1)
        XCTAssertEqual(wire["authorDid"] as? String, id.did)
        XCTAssertEqual(wire["room"] as? String, "room1")
        XCTAssertNotNil(wire["signatureB64"] as? String)

        // Survive an actual JSON round-trip.
        let data = try JSONSerialization.data(withJSONObject: wire)
        let parsed = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let back = try XCTUnwrap(WireCodec.deserialize(parsed))

        XCTAssertEqual(back.hash, change.hash)
        XCTAssertEqual(back.lamport, 1)
        XCTAssertEqual(back.authorDID, id.did)
        XCTAssertEqual(back.payload.schemaId, "xnet://xnet.fyi/Task@1.0.0")
        XCTAssertEqual(back.payload.properties, change.payload.properties)
        // The reconstructed change still verifies (recomputed hash + signature).
        XCTAssertTrue(back.verify())
    }

    func testDeserializeRejectsGarbage() {
        XCTAssertNil(WireCodec.deserialize(["id": "x"]))
    }
}
