import Foundation

/// A schema reference: `"xnet://authority/Name@version"`.
public typealias SchemaIRI = String

/// The content of a single change to a node (sparse: only changed properties).
public struct NodePayload: Sendable, Equatable {
    public var nodeId: String
    /// REQUIRED on a node's first change only.
    public var schemaId: SchemaIRI?
    public var properties: [String: JSONValue]
    public var deleted: Bool?

    public init(
        nodeId: String,
        schemaId: SchemaIRI? = nil,
        properties: [String: JSONValue] = [:],
        deleted: Bool? = nil
    ) {
        self.nodeId = nodeId
        self.schemaId = schemaId
        self.properties = properties
        self.deleted = deleted
    }

    func canonicalObject() -> JSONValue {
        var obj: [String: JSONValue] = [
            "nodeId": .string(nodeId),
            "properties": .object(properties)
        ]
        if let schemaId { obj["schemaId"] = .string(schemaId) }
        if let deleted, deleted { obj["deleted"] = .bool(true) }
        return .object(obj)
    }
}

/// A signed, hash-chained change record — the atomic unit of replication
/// (docs/specs/protocol §L1.5–§L1.6). `xnet/1.0` uses `protocolVersion = 4`.
/// Must equal `CURRENT_PROTOCOL_VERSION` in packages/sync/src/change.ts —
/// enforced by packages/sync/src/__tests__/protocol-version-parity.test.ts.
public struct Change: Sendable, Equatable {
    public var protocolVersion: Int64 = 4
    public var id: String
    public var type: String = "node-change"
    public var payload: NodePayload
    public var parentHash: String?
    public var authorDID: DID
    public var wallTime: Int64
    public var lamport: Int64
    /// `"cid:blake3:<hex>"` over the canonical bytes of the unsigned change.
    public var hash: String
    /// Ed25519 over the UTF-8 bytes of the `hash` *string*.
    public var signature: [UInt8]

    /// The canonical JSON object of the unsigned change (all fields except
    /// `hash`/`signature`), used for hashing and signing.
    public func unsignedObject() -> JSONValue {
        .object([
            "protocolVersion": .int(protocolVersion),
            "id": .string(id),
            "type": .string(type),
            "payload": payload.canonicalObject(),
            "parentHash": parentHash.map(JSONValue.string) ?? .null,
            "authorDID": .string(authorDID),
            "wallTime": .int(wallTime),
            "lamport": .int(lamport)
        ])
    }

    /// `"cid:blake3:" + hex(BLAKE3(canonical(unsigned)))`. The `protocolVersion`
    /// field is dropped before hashing when it is 0/absent (legacy), kept for
    /// `xnet/1.0` (= 4).
    public static func hash(ofUnsigned object: JSONValue) -> String {
        var obj = object
        if case .object(var dict) = obj {
            if let pv = dict["protocolVersion"], pv.intValue ?? 0 == 0 {
                dict.removeValue(forKey: "protocolVersion")
            }
            obj = .object(dict)
        }
        return "cid:blake3:" + XNetCrypto.blake3Hex(Array(obj.canonicalJSON().utf8))
    }

    /// Build and sign a change authored by `identity`.
    public static func create(
        id: String,
        payload: NodePayload,
        parentHash: String?,
        wallTime: Int64,
        lamport: Int64,
        by identity: Identity
    ) -> Change {
        var change = Change(
            id: id,
            payload: payload,
            parentHash: parentHash,
            authorDID: identity.did,
            wallTime: wallTime,
            lamport: lamport,
            hash: "",
            signature: []
        )
        change.hash = Change.hash(ofUnsigned: change.unsignedObject())
        change.signature = identity.sign(Array(change.hash.utf8))
        return change
    }

    /// Recompute the hash and verify the Ed25519 signature against `authorDID`.
    public func verify() -> Bool {
        guard Change.hash(ofUnsigned: unsignedObject()) == hash else { return false }
        return Identity.verify(signature, message: Array(hash.utf8), did: authorDID)
    }
}
