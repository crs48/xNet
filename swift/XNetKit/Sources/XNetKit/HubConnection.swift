import Foundation

/// Encodes/decodes a `Change` to the hub's `SerializedNodeChange` wire shape
/// (packages/hub/src/storage/interface.ts): flat `lamportTime`/`lamportAuthor`,
/// base64 `signatureB64`, and a redundant top-level `nodeId`/`schemaId`.
public enum WireCodec {
    public static func serialize(_ c: Change, room: String) -> [String: Any] {
        var payload: [String: Any] = [
            "nodeId": c.payload.nodeId,
            "properties": JSONValue.object(c.payload.properties).toFoundation()
        ]
        if let s = c.payload.schemaId { payload["schemaId"] = s }
        if let d = c.payload.deleted, d { payload["deleted"] = true }

        var wire: [String: Any] = [
            "id": c.id,
            "type": c.type,
            "hash": c.hash,
            "room": room,
            "nodeId": c.payload.nodeId,
            "lamportTime": c.lamport,
            "lamportAuthor": c.authorDID,
            "authorDid": c.authorDID,
            "wallTime": c.wallTime,
            "payload": payload,
            "signatureB64": Data(c.signature).base64EncodedString(),
            "protocolVersion": c.protocolVersion
        ]
        wire["parentHash"] = c.parentHash ?? NSNull()
        if let s = c.payload.schemaId { wire["schemaId"] = s }
        return wire
    }

    public static func deserialize(_ d: [String: Any]) -> Change? {
        guard let id = d["id"] as? String,
              let hash = d["hash"] as? String,
              let authorDid = d["authorDid"] as? String,
              let sigB64 = d["signatureB64"] as? String,
              let sig = Data(base64Encoded: sigB64),
              let payloadDict = d["payload"] as? [String: Any],
              let nodeId = payloadDict["nodeId"] as? String
        else { return nil }

        var props: [String: JSONValue] = [:]
        if case .object(let o) = JSONValue.from(foundation: payloadDict["properties"] ?? [String: Any]()) {
            props = o
        }
        let payload = NodePayload(
            nodeId: nodeId,
            schemaId: payloadDict["schemaId"] as? String,
            properties: props,
            deleted: payloadDict["deleted"] as? Bool
        )
        return Change(
            protocolVersion: (d["protocolVersion"] as? NSNumber)?.int64Value ?? 4,
            id: id,
            type: d["type"] as? String ?? "node-change",
            payload: payload,
            parentHash: d["parentHash"] as? String,
            authorDID: authorDid,
            wallTime: (d["wallTime"] as? NSNumber)?.int64Value ?? 0,
            lamport: (d["lamportTime"] as? NSNumber)?.int64Value ?? 0,
            hash: hash,
            signature: [UInt8](sig)
        )
    }
}

/// A live connection to an xNet hub over WebSocket — the L2 replication binding
/// (docs/specs/protocol/03-replication.md). Speaks the same JSON frames as the
/// reference hub: a version handshake, room subscribe, `node-change` publish,
/// and `node-sync-request`/`node-sync-response` catch-up.
///
/// Single-threaded usage (drive from one task); see exploration 0210 for the
/// concurrency follow-up.
public final class HubConnection {
    public enum HubError: Error, CustomStringConvertible {
        case unexpected(String)
        case nodeError(String)
        case timeout
        public var description: String {
            switch self {
            case .unexpected(let s): return "unexpected: \(s)"
            case .nodeError(let s): return "hub node-error: \(s)"
            case .timeout: return "timed out waiting for hub response"
            }
        }
    }

    private let task: URLSessionWebSocketTask
    private let did: DID
    private var streaming = false

    /// Invoked for each relayed `node-change` received while streaming. Set this
    /// before `startStreaming()`. The handler runs on the read-loop's task — drive
    /// a single store from it and don't touch that store from elsewhere concurrently.
    public var onRemoteChange: ((Change) -> Void)?

    public init(url: URL, did: DID, session: URLSession = .shared) {
        self.did = did
        self.task = session.webSocketTask(with: url)
    }

    /// Open the socket, consume the hub handshake, and send our client-handshake.
    public func connect() async throws {
        task.resume()
        let handshake = try await receiveJSON()
        guard handshake["type"] as? String == "handshake" else {
            throw HubError.unexpected("expected handshake, got \(handshake["type"] ?? "nil")")
        }
        // NOTE: these are the *hub WebSocket handshake* protocol versions, which
        // are deliberately NOT the change-record protocol version (`Change
        // .protocolVersion`, currently 4). The hub advertises
        // `hubProtocolVersion = 1` in packages/hub/src/ws/handlers/
        // client-handshake.ts; sending 4 here would produce a spurious
        // `version-mismatch`. Two different numbers, same field name.
        try await sendJSON([
            "type": "client-handshake",
            "did": did,
            "protocolVersion": 1,
            "minProtocolVersion": 1,
            "xnetProtocol": [XNetKit.protocolVersion],
            "features": [],
            "packageVersion": XNetKit.version
        ])
    }

    /// Subscribe to a room's pub/sub topic so the hub relays others' changes here.
    public func subscribe(room: String) async throws {
        try await sendJSON(["type": "subscribe", "topics": ["xnet-doc-\(room)"]])
    }

    /// Start a background read loop that delivers relayed `node-change`s to
    /// `onRemoteChange` in real time (call `subscribe(room:)` first). Use this for
    /// the streaming phase; do not interleave `syncRequest` (which reads directly)
    /// with an active stream on the same connection. `publish` is safe concurrently.
    public func startStreaming() {
        guard !streaming else { return }
        streaming = true
        Task { [weak self] in
            while let self, self.streaming {
                guard let msg = try? await self.receiveJSON() else { break }
                guard msg["type"] as? String == "publish",
                      let data = msg["data"] as? [String: Any],
                      data["type"] as? String == "node-change",
                      let raw = data["change"] as? [String: Any],
                      let change = WireCodec.deserialize(raw)
                else { continue }
                self.onRemoteChange?(change)
            }
        }
    }

    /// Publish a signed change into a room (the hub verifies hash + signature,
    /// then stores and relays it).
    public func publish(_ change: Change, room: String) async throws {
        try await sendJSON([
            "type": "publish",
            "topic": "xnet-doc-\(room)",
            "data": [
                "type": "node-change",
                "room": room,
                "change": WireCodec.serialize(change, room: room)
            ]
        ])
    }

    /// Catch-up: ask the hub for all changes in a room after `sinceLamport`.
    public func syncRequest(room: String, sinceLamport: Int64 = 0) async throws -> [Change] {
        try await sendJSON(["type": "node-sync-request", "room": room, "sinceLamport": sinceLamport])
        for _ in 0..<100 {
            let msg = try await receiveJSON()
            switch msg["type"] as? String {
            case "node-sync-response":
                let raw = (msg["changes"] as? [[String: Any]]) ?? []
                return raw.compactMap(WireCodec.deserialize)
            case "node-error":
                throw HubError.nodeError(String(describing: msg))
            default:
                continue  // ignore unrelated frames (relayed changes, awareness, …)
            }
        }
        throw HubError.timeout
    }

    public func close() {
        streaming = false
        task.cancel(with: .goingAway, reason: nil)
    }

    private func sendJSON(_ obj: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: obj)
        try await task.send(.string(String(decoding: data, as: UTF8.self)))
    }

    private func receiveJSON() async throws -> [String: Any] {
        switch try await task.receive() {
        case .string(let s):
            return (try JSONSerialization.jsonObject(with: Data(s.utf8)) as? [String: Any]) ?? [:]
        case .data(let d):
            return (try JSONSerialization.jsonObject(with: d) as? [String: Any]) ?? [:]
        @unknown default:
            return [:]
        }
    }
}
