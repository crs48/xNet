import XCTest
@testable import XNetKit

/// Validates XNetKit's kernel against the shared golden vectors in
/// `conformance/vectors/` — the same corpus the TypeScript reference and the
/// Python/Swift reference kernels pass. This is the proof that XNetKit
/// interoperates byte-for-byte, not just in spirit.
final class ConformanceTests: XCTestCase {
    /// …/swift/XNetKit/Tests/XNetKitTests/ConformanceTests.swift → repo root → conformance/vectors
    static let vectorsDir = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // XNetKitTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // XNetKit
        .deletingLastPathComponent()  // swift
        .deletingLastPathComponent()  // repo root
        .appendingPathComponent("conformance/vectors")

    func loadVectors(_ suite: String) throws -> [(String, [String: Any])] {
        let dir = Self.vectorsDir.appendingPathComponent(suite)
        let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
        return try files.filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { url in
                let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
                return (url.deletingPathExtension().lastPathComponent, json)
            }
    }

    func testIdentityVectors() throws {
        let vectors = try loadVectors("identity")
        XCTAssertFalse(vectors.isEmpty, "no identity vectors found at \(Self.vectorsDir.path)")
        for (name, v) in vectors {
            let input = v["input"] as! [String: Any]
            let expected = v["expected"] as! [String: Any]
            let identity = try Identity(seed: XNetCrypto.hexDecode(input["seedHex"] as! String))
            XCTAssertEqual(XNetCrypto.hexEncode(identity.publicKey), expected["publicKeyHex"] as! String, "\(name) pub")
            XCTAssertEqual(identity.did, expected["did"] as! String, "\(name) did")
            XCTAssertEqual(Identity.publicKey(from: identity.did), identity.publicKey, "\(name) roundtrip")
        }
    }

    func testChangeVectors() throws {
        let vectors = try loadVectors("change")
        XCTAssertFalse(vectors.isEmpty)
        for (name, v) in vectors {
            let input = v["input"] as! [String: Any]
            let expected = v["expected"] as! [String: Any]
            let unsigned = JSONValue.from(foundation: input["unsignedChange"]!)
            // Canonical bytes and change hash must match the TypeScript reference.
            XCTAssertEqual(unsigned.canonicalJSON(), expected["canonicalJson"] as! String, "\(name) canonical")
            XCTAssertEqual(Change.hash(ofUnsigned: unsigned), expected["hash"] as! String, "\(name) hash")
            // And a TypeScript-produced signature must verify under XNetKit.
            let did = expected["authorDID"] as! String
            let sig = [UInt8](Data(base64Encoded: expected["signatureBase64"] as! String)!)
            XCTAssertTrue(
                Identity.verify(sig, message: Array((expected["hash"] as! String).utf8), did: did),
                "\(name) verify"
            )
        }
    }

    func testLWWVectors() throws {
        let vectors = try loadVectors("lww")
        XCTAssertFalse(vectors.isEmpty)
        for (name, v) in vectors {
            let input = v["input"] as! [String: Any]
            let expected = v["expected"] as! [String: Any]
            let changes = (input["changes"] as! [[String: Any]]).map { c in
                LWWInput(
                    authorDID: c["authorDID"] as! String,
                    lamport: (c["lamport"] as! NSNumber).int64Value,
                    wallTime: (c["wallTime"] as! NSNumber).int64Value,
                    properties: jsonObject(c["properties"]!)
                )
            }
            let folded = LWW.fold(changes)
            XCTAssertEqual(.object(folded.properties), JSONValue.from(foundation: expected["properties"]!), "\(name) props")
        }
    }

    func testRoundTripSignVerify() throws {
        // A change created and signed by XNetKit verifies under XNetKit (CryptoKit
        // signatures are randomized, so this is sign-then-verify, not byte-equality).
        let identity = try Identity(seed: Array(repeating: 0xab, count: 32))
        let change = Change.create(
            id: "chg-rt",
            payload: NodePayload(nodeId: "n1", schemaId: "xnet://xnet.fyi/Task@1.0.0", properties: ["title": "hi"]),
            parentHash: nil, wallTime: 1, lamport: 1, by: identity
        )
        XCTAssertTrue(change.verify())
    }

    private func jsonObject(_ value: Any) -> [String: JSONValue] {
        if case .object(let dict) = JSONValue.from(foundation: value) { return dict }
        return [:]
    }
}
