import Foundation

/// A handle that undoes a subscription when cancelled (or deinited).
///
/// Intentionally NOT `Sendable`: like the store it observes, it is single-
/// threaded (use from one isolation domain, e.g. the main actor). Promising
/// `Sendable` here would hide the cross-thread mutation the compiler should
/// flag; an `actor`-based store is the documented follow-up (exploration 0210).
public final class Cancellable {
    private let _cancel: () -> Void
    public init(_ cancel: @escaping () -> Void) { _cancel = cancel }
    public func cancel() { _cancel() }
    deinit { _cancel() }
}

/// A local, in-memory xNet node store: the native-Swift analogue of
/// `@xnetjs/data`'s `NodeStore`. It signs every mutation into a `Change`,
/// materializes node state via per-property LWW, and notifies subscribers.
///
/// Scope of this slice: local-first reads/writes + reactive queries. It is NOT
/// yet wired to a hub for live sync, and is single-writer (the owning identity).
/// Concurrency: use from one actor/thread (e.g. the main actor in a SwiftUI app);
/// a Swift-6 `actor` refactor is a documented follow-up (exploration 0210).
public final class NodeStore {
    public let identity: Identity
    private let now: () -> Int64
    private var schemas: [SchemaIRI: Schema] = [:]
    private var log: [String: [Change]] = [:]
    private var states: [String: NodeState] = [:]
    private var seenHashes: Set<String> = []
    private var lamportClock: Int64 = 0
    private var listeners: [UUID: () -> Void] = [:]
    private let persistence: ChangeLogStore?

    /// Fired for each change authored locally (via create/update/delete), e.g. so
    /// a `HubConnection` can publish it. NOT fired for changes applied via `apply`
    /// (which carries remote/peer changes), avoiding echo loops.
    public var onLocalChange: ((Change) -> Void)?

    public init(
        identity: Identity,
        persistence: ChangeLogStore? = nil,
        now: @escaping () -> Int64 = NodeStore.wallClock
    ) {
        self.identity = identity
        self.persistence = persistence
        self.now = now
        // Rebuild state by replaying the durable log (without re-persisting it).
        if let persistence {
            for change in persistence.load() { applyInternal(change, persist: false) }
        }
    }

    public static let wallClock: () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }

    // MARK: - Schema registry

    public func register(_ schema: Schema) { schemas[schema.id] = schema }
    public func schema(_ id: SchemaIRI) -> Schema? { schemas[id] }

    // MARK: - Writes

    /// Create a node of `schema`, signing its first change (which carries the schemaId).
    @discardableResult
    public func create(
        _ schema: Schema, id: String = NodeStore.newId(), _ properties: [String: JSONValue]
    ) -> NodeState {
        register(schema)
        applyLocal(Change.create(
            id: NodeStore.newId(),
            payload: NodePayload(nodeId: id, schemaId: schema.id, properties: properties),
            parentHash: lastHash(of: id),
            wallTime: now(),
            lamport: nextLamport(),
            by: identity
        ))
        return states[id]!
    }

    /// Apply a sparse update to an existing node.
    @discardableResult
    public func update(_ nodeId: String, _ properties: [String: JSONValue]) -> NodeState? {
        guard states[nodeId] != nil else { return nil }
        applyLocal(Change.create(
            id: NodeStore.newId(),
            payload: NodePayload(nodeId: nodeId, properties: properties),
            parentHash: lastHash(of: nodeId),
            wallTime: now(),
            lamport: nextLamport(),
            by: identity
        ))
        return states[nodeId]
    }

    /// Soft-delete (tombstone) a node.
    @discardableResult
    public func delete(_ nodeId: String) -> NodeState? {
        guard states[nodeId] != nil else { return nil }
        applyLocal(Change.create(
            id: NodeStore.newId(),
            payload: NodePayload(nodeId: nodeId, properties: [:], deleted: true),
            parentHash: lastHash(of: nodeId),
            wallTime: now(),
            lamport: nextLamport(),
            by: identity
        ))
        return states[nodeId]
    }

    /// Apply a locally-authored change and notify `onLocalChange` (for sync).
    private func applyLocal(_ change: Change) {
        apply(change)
        onLocalChange?(change)
    }

    /// Apply a signed change from any author (local or, in future, a peer).
    /// Verifies the signature, is idempotent, advances the Lamport clock, then
    /// re-materializes the node and notifies subscribers.
    @discardableResult
    public func apply(_ change: Change) -> Bool { applyInternal(change, persist: true) }

    @discardableResult
    private func applyInternal(_ change: Change, persist: Bool) -> Bool {
        guard change.verify() else { return false }
        guard !seenHashes.contains(change.hash) else { return true }
        seenHashes.insert(change.hash)
        lamportClock = max(lamportClock, change.lamport)
        log[change.payload.nodeId, default: []].append(change)
        states[change.payload.nodeId] = materialize(change.payload.nodeId)
        if persist { persistence?.append(change) }
        notify()
        return true
    }

    // MARK: - Reads

    public func node(_ id: String) -> NodeState? {
        guard let s = states[id], !s.deleted else { return nil }
        return s
    }

    public func query(_ q: Query) -> [NodeState] {
        var rows = states.values.filter {
            $0.schemaId == q.schemaId && (q.includeDeleted || !$0.deleted)
        }
        if let p = q.predicate { rows = rows.filter { p.matches($0) } }
        var array = Array(rows)
        if let field = q.orderBy {
            array.sort { a, b in
                let cmp = JSONValue.compare(a[field], b[field])
                return q.descending ? cmp == .orderedDescending : cmp == .orderedAscending
            }
        } else {
            // Stable default: creation order.
            array.sort { $0.createdAt < $1.createdAt }
        }
        if let limit = q.limit { array = Array(array.prefix(limit)) }
        return array
    }

    // MARK: - Reactivity

    /// Register a change listener; returns a `Cancellable` that unsubscribes.
    public func subscribe(_ listener: @escaping () -> Void) -> Cancellable {
        let id = UUID()
        listeners[id] = listener
        return Cancellable { [weak self] in self?.listeners.removeValue(forKey: id) }
    }

    // MARK: - Internals

    private func notify() { for l in listeners.values { l() } }

    private func nextLamport() -> Int64 { lamportClock += 1; return lamportClock }

    private func lastHash(of nodeId: String) -> String? { log[nodeId]?.last?.hash }

    private func materialize(_ nodeId: String) -> NodeState {
        let changes = log[nodeId] ?? []
        let inputs = changes.map {
            LWWInput(
                authorDID: $0.authorDID, lamport: $0.lamport, wallTime: $0.wallTime,
                properties: $0.payload.properties, deleted: $0.payload.deleted ?? false
            )
        }
        let folded = LWW.fold(inputs)

        // createdAt / createdBy / schemaId come from the node's earliest change
        // (by lamport, then wallTime) — order-independent under out-of-order
        // replication, unlike append order.
        let earliest = changes.min {
            $0.lamport != $1.lamport ? $0.lamport < $1.lamport : $0.wallTime < $1.wallTime
        }
        let schemaId = earliest?.payload.schemaId
            ?? changes.compactMap { $0.payload.schemaId }.first ?? ""

        // `deleted` is resolved by LWW over the changes that set it.
        var deleted = false
        var deletedTS: PropertyTimestamp?
        for c in changes where c.payload.deleted != nil {
            let ts = PropertyTimestamp(lamport: c.lamport, wallTime: c.wallTime, author: c.authorDID)
            if deletedTS == nil || ts.wins(over: deletedTS!) {
                deletedTS = ts
                deleted = c.payload.deleted ?? false
            }
        }

        return NodeState(
            id: nodeId,
            schemaId: schemaId,
            createdAt: earliest?.wallTime ?? now(),
            createdBy: earliest?.authorDID ?? identity.did,
            properties: folded.properties,
            timestamps: folded.timestamps,
            deleted: deleted
        )
    }

    /// A nanoid-style 21-char URL-safe id (~125 bits).
    public static func newId() -> String {
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
        var rng = SystemRandomNumberGenerator()
        return String((0..<21).map { _ in alphabet[Int.random(in: 0..<alphabet.count, using: &rng)] })
    }
}
