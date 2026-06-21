import Foundation

/// A per-property Last-Write-Wins timestamp (docs/specs/protocol §L1.7).
public struct PropertyTimestamp: Sendable, Equatable {
    public var lamport: Int64
    public var wallTime: Int64
    public var author: DID

    /// `self` wins over `other` per the spec ordering: higher lamport, then
    /// higher wallTime, then higher authorDID (lexicographic) — a total,
    /// deterministic order so every peer converges identically.
    public func wins(over other: PropertyTimestamp) -> Bool {
        if lamport != other.lamport { return lamport > other.lamport }
        if wallTime != other.wallTime { return wallTime > other.wallTime }
        return author > other.author
    }
}

/// The materialized state of a node: the fold of its change log.
public struct NodeState: Sendable, Equatable, Identifiable {
    public var id: String
    public var schemaId: SchemaIRI
    public var createdAt: Int64
    public var createdBy: DID
    public var properties: [String: JSONValue]
    public var timestamps: [String: PropertyTimestamp]
    public var deleted: Bool

    /// Read a property value by name.
    public subscript(_ key: String) -> JSONValue? { properties[key] }
}

/// One contribution to the LWW fold — the subset of a change that LWW reads.
public struct LWWInput: Sendable {
    public var authorDID: DID
    public var lamport: Int64
    public var wallTime: Int64
    public var properties: [String: JSONValue]
    public var deleted: Bool

    public init(
        authorDID: DID, lamport: Int64, wallTime: Int64,
        properties: [String: JSONValue], deleted: Bool = false
    ) {
        self.authorDID = authorDID
        self.lamport = lamport
        self.wallTime = wallTime
        self.properties = properties
        self.deleted = deleted
    }
}

public enum LWW {
    /// Fold change contributions into converged property values + timestamps.
    /// Order-independent: any permutation yields the same result.
    public static func fold(
        _ changes: [LWWInput]
    ) -> (properties: [String: JSONValue], timestamps: [String: PropertyTimestamp]) {
        var properties: [String: JSONValue] = [:]
        var timestamps: [String: PropertyTimestamp] = [:]
        for c in changes {
            let ts = PropertyTimestamp(lamport: c.lamport, wallTime: c.wallTime, author: c.authorDID)
            for (key, value) in c.properties {
                if let current = timestamps[key], !ts.wins(over: current) { continue }
                properties[key] = value
                timestamps[key] = ts
            }
        }
        return (properties, timestamps)
    }
}
