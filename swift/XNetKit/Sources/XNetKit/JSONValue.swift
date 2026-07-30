import Foundation

/// A deterministic, `Sendable` JSON value. xNet property values and change
/// payloads are plain JSON; using an explicit enum (rather than `Any`) makes
/// canonicalization unambiguous and lets the whole SDK be `Sendable`.
public enum JSONValue: Sendable, Equatable, Hashable {
    case string(String)
    case int(Int64)
    case double(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])
}

public extension JSONValue {
    /// Canonical JSON per the xNet protocol ([L1 §6]): keys sorted recursively
    /// (UTF-16 / ASCII order), no insignificant whitespace, arrays in order,
    /// matching JS `JSON.stringify(sortKeysRecursively(value))`.
    func canonicalJSON() -> String {
        switch self {
        case .null: return "null"
        case .bool(let b): return b ? "true" : "false"
        case .int(let i): return String(i)
        case .double(let d):
            // Integer-valued numbers (incl. money minor units / large counts up
            // to Int64) emit as JS would: "10000000000000000", not "1e+16".
            if let i = Int64(exactly: d) { return String(i) }
            // KNOWN LIMITATION: fractional / out-of-Int64 doubles are not yet
            // guaranteed byte-identical to JS `Number::toString` (which uses
            // un-padded exponents and a specific decimal/exponential threshold).
            // xNet's hashed numeric surface is integer-valued, so this is an edge;
            // a Ryu/Grisu port is the proper fix (see exploration 0210 review).
            return String(d)
        case .string(let s): return JSONValue.encodeString(s)
        case .array(let arr):
            return "[" + arr.map { $0.canonicalJSON() }.joined(separator: ",") + "]"
        case .object(let dict):
            // Sort keys by UTF-16 code unit to match JS `Array.prototype.sort` /
            // `String <` (NOT Swift's default Unicode-scalar order — they differ
            // for astral-plane keys). This is part of the byte-exact contract.
            let body = dict.keys
                .sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
                .map { key in JSONValue.encodeString(key) + ":" + dict[key]!.canonicalJSON() }
                .joined(separator: ",")
            return "{" + body + "}"
        }
    }

    /// JSON string encoding matching JS `JSON.stringify` (escape `"`, `\\`, and
    /// the control characters; pass UTF-8 through — no `\\u` for non-ASCII).
    static func encodeString(_ s: String) -> String {
        var out = "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }
}

// MARK: - Ergonomic literals

extension JSONValue: ExpressibleByStringLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
}
extension JSONValue: ExpressibleByIntegerLiteral {
    public init(integerLiteral value: Int64) { self = .int(value) }
}
extension JSONValue: ExpressibleByBooleanLiteral {
    public init(booleanLiteral value: Bool) { self = .bool(value) }
}
extension JSONValue: ExpressibleByFloatLiteral {
    public init(floatLiteral value: Double) { self = .double(value) }
}

public extension JSONValue {
    var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    var intValue: Int64? {
        switch self {
        case .int(let i): return i
        case .double(let d) where d.rounded() == d: return Int64(d)
        default: return nil
        }
    }
    var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
    /// Convert to a Foundation JSON value (for `JSONSerialization`).
    func toFoundation() -> Any {
        switch self {
        case .null: return NSNull()
        case .bool(let b): return b
        case .int(let i): return i
        case .double(let d): return d
        case .string(let s): return s
        case .array(let a): return a.map { $0.toFoundation() }
        case .object(let o): return o.mapValues { $0.toFoundation() }
        }
    }

    /// A numeric projection used for ordering/range comparisons (int or double).
    var numberValue: Double? {
        switch self {
        case .int(let i): return Double(i)
        case .double(let d): return d
        default: return nil
        }
    }

    /// Parse a Foundation JSON object (from `JSONSerialization`) into a `JSONValue`.
    static func from(foundation value: Any) -> JSONValue {
        switch value {
        case is NSNull: return .null
        case let n as NSNumber:
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return .bool(n.boolValue) }
            // Integers (lamport, wallTime, counts) vs. fractional numbers.
            let d = n.doubleValue
            if let i = Int64(exactly: d) { return .int(i) }
            return .double(d)
        case let s as String: return .string(s)
        case let arr as [Any]: return .array(arr.map(JSONValue.from(foundation:)))
        case let dict as [String: Any]:
            var out: [String: JSONValue] = [:]
            for (k, v) in dict { out[k] = JSONValue.from(foundation: v) }
            return .object(out)
        default: return .null
        }
    }
}
