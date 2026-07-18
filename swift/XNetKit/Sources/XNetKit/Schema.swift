import Foundation

/// A schema property type (the `xnet/1.0` vocabulary subset XNetKit models).
public enum PropertyType: String, Sendable {
    case text, number, checkbox, json, date, select, multiSelect
    case person, relation, money, url, email
}

/// A declared schema property.
public struct Property: Sendable, Equatable {
    public var name: String
    public var type: PropertyType
    public var required: Bool
    public var config: [String: JSONValue]
}

// MARK: - Property builders (the leaves of the schema DSL)

public func text(_ name: String, required: Bool = false, maxLength: Int? = nil) -> Property {
    var config: [String: JSONValue] = [:]
    if let maxLength { config["maxLength"] = .int(Int64(maxLength)) }
    return Property(name: name, type: .text, required: required, config: config)
}

public func number(_ name: String, required: Bool = false) -> Property {
    Property(name: name, type: .number, required: required, config: [:])
}

public func checkbox(_ name: String, default value: Bool = false) -> Property {
    Property(name: name, type: .checkbox, required: false, config: ["default": .bool(value)])
}

public func select(_ name: String, options: [String], default value: String? = nil) -> Property {
    var config: [String: JSONValue] = ["options": .array(options.map(JSONValue.string))]
    if let value { config["default"] = .string(value) }
    return Property(name: name, type: .select, required: false, config: config)
}

public func person(_ name: String, multiple: Bool = false) -> Property {
    Property(name: name, type: .person, required: false, config: ["multiple": .bool(multiple)])
}

public func relation(_ name: String, target: SchemaIRI? = nil, multiple: Bool = false) -> Property {
    var config: [String: JSONValue] = ["multiple": .bool(multiple)]
    if let target { config["target"] = .string(target) }
    return Property(name: name, type: .relation, required: false, config: config)
}

public func money(_ name: String, currency: String) -> Property {
    Property(name: name, type: .money, required: false, config: ["currency": .string(currency)])
}

public func date(_ name: String, includeTime: Bool = false) -> Property {
    Property(name: name, type: .date, required: false, config: ["includeTime": .bool(includeTime)])
}

/// Result builder that collects the declared properties of a schema.
@resultBuilder
public enum SchemaBuilder {
    public static func buildBlock(_ properties: Property...) -> [Property] { properties }
    public static func buildExpression(_ property: Property) -> Property { property }
}

/// Authorization for a schema. A simplified facade over the protocol's role/
/// expression engine (whose evaluation is pinned by `conformance/vectors/authz`);
/// XNetKit ships the common presets and records them on the schema.
public struct Authorization: Sendable, Equatable {
    public enum Kind: Sendable, Equatable {
        case ownerOnly
        case spaceCascade(relation: String)
        case publicRead
    }
    public var kind: Kind

    /// Owner-only (the safe default).
    public static func `private`() -> Authorization { .init(kind: .ownerOnly) }
    /// Inherit access from a containing Space via the named relation.
    public static func spaceCascade(relation: String = "space") -> Authorization {
        .init(kind: .spaceCascade(relation: relation))
    }
    /// Anyone reads; the owner writes.
    public static func publicRead() -> Authorization { .init(kind: .publicRead) }
}

/// An xNet schema — the Swift analogue of TS `defineSchema(...)`. It lowers to
/// the same `SchemaIRI` (`xnet://authority/Name@version`) and property set.
public struct Schema: Sendable, Equatable {
    public var name: String
    public var namespace: String   // e.g. "xnet://xnet.fyi/"
    public var version: String
    public var properties: [Property]
    public var authorization: Authorization?

    public init(
        name: String,
        namespace: String,
        version: String = "1.0.0",
        authorization: Authorization? = nil,
        @SchemaBuilder _ properties: () -> [Property]
    ) {
        self.name = name
        self.namespace = namespace
        self.version = version
        self.authorization = authorization
        self.properties = properties()
    }

    /// The canonical schema id: `xnet://authority/Name@version`.
    public var id: SchemaIRI { "\(namespace)\(name)@\(version)" }

    public func property(_ name: String) -> Property? {
        properties.first { $0.name == name }
    }

    /// The per-property IRI, e.g. `xnet://xnet.fyi/Task#title`.
    public func propertyIRI(_ name: String) -> String { "\(namespace)\(self.name)#\(name)" }
}
