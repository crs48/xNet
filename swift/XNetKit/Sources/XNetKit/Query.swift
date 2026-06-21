import Foundation

/// A data-driven (closure-free, `Sendable`) query predicate over node properties.
public indirect enum Predicate: Sendable, Equatable {
    case equals(String, JSONValue)
    case notEquals(String, JSONValue)
    case greaterThan(String, JSONValue)
    case lessThan(String, JSONValue)
    case contains(String, String)
    case exists(String)
    case and([Predicate])
    case or([Predicate])

    public func matches(_ node: NodeState) -> Bool {
        switch self {
        case .equals(let k, let v): return node[k] == v
        case .notEquals(let k, let v): return node[k] != v
        case .greaterThan(let k, let v): return JSONValue.compare(node[k], v) == .orderedDescending
        case .lessThan(let k, let v): return JSONValue.compare(node[k], v) == .orderedAscending
        case .contains(let k, let sub): return node[k]?.stringValue?.contains(sub) ?? false
        case .exists(let k): return node[k] != nil
        case .and(let ps): return ps.allSatisfy { $0.matches(node) }
        case .or(let ps): return ps.contains { $0.matches(node) }
        }
    }
}

public extension JSONValue {
    /// Total-ish ordering used for `orderBy` and range predicates. Compares
    /// numbers numerically and strings lexicographically; unlike types and
    /// `nil` sort last.
    static func compare(_ a: JSONValue?, _ b: JSONValue?) -> ComparisonResult {
        switch (a, b) {
        case (nil, nil): return .orderedSame
        case (nil, _): return .orderedDescending  // nil sorts last
        case (_, nil): return .orderedAscending
        case (.some(let x), .some(let y)):
            // Numbers compare numerically (int + double, mixed).
            if let xn = x.numberValue, let yn = y.numberValue {
                return xn == yn ? .orderedSame : (xn < yn ? .orderedAscending : .orderedDescending)
            }
            if case .bool(let xb) = x, case .bool(let yb) = y {
                return xb == yb ? .orderedSame : (!xb && yb ? .orderedAscending : .orderedDescending)
            }
            if let xs = x.stringValue, let ys = y.stringValue {
                if xs == ys { return .orderedSame }
                return xs < ys ? .orderedAscending : .orderedDescending
            }
            return .orderedSame
        }
    }
}

/// A query over the node store. Fluent: `Query(TaskSchema, where: .equals("status", "todo")).ordered(by: "title").limited(20)`.
public struct Query: Sendable, Equatable {
    public var schemaId: SchemaIRI
    public var predicate: Predicate?
    public var orderBy: String?
    public var descending: Bool
    public var limit: Int?
    public var includeDeleted: Bool

    public init(
        schemaId: SchemaIRI,
        where predicate: Predicate? = nil,
        includeDeleted: Bool = false
    ) {
        self.schemaId = schemaId
        self.predicate = predicate
        self.orderBy = nil
        self.descending = false
        self.limit = nil
        self.includeDeleted = includeDeleted
    }

    public init(_ schema: Schema, where predicate: Predicate? = nil, includeDeleted: Bool = false) {
        self.init(schemaId: schema.id, where: predicate, includeDeleted: includeDeleted)
    }

    public func ordered(by field: String, descending: Bool = false) -> Query {
        var q = self; q.orderBy = field; q.descending = descending; return q
    }

    public func limited(_ n: Int) -> Query {
        var q = self; q.limit = n; return q
    }
}
