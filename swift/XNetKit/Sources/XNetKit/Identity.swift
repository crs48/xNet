import Foundation
import CryptoKit

/// A `did:key` decentralized identifier — `"did:key:z" + base58btc(0xed01 || pub)`.
public typealias DID = String

/// An xNet identity: an Ed25519 key pair addressed by a `did:key`.
///
/// NOTE: Apple's CryptoKit `Curve25519.Signing` uses randomized nonces, so
/// signatures *verify* correctly but are not the deterministic RFC-8032 bytes a
/// `@noble`/PyNaCl signer produces. That is fine for interop (you verify others'
/// signatures and emit your own valid ones); it just means a Swift-produced
/// signature won't be byte-identical to a TypeScript-produced one.
public struct Identity: Sendable {
    public let did: DID
    public let publicKey: [UInt8]
    private let privateKey: Curve25519.Signing.PrivateKey

    /// Ed25519 multicodec prefix (varint 0xed 0x01).
    static let multicodec: [UInt8] = [0xed, 0x01]

    /// Generate a fresh random identity.
    public init() {
        let key = Curve25519.Signing.PrivateKey()
        self.init(privateKey: key)
    }

    /// Derive a deterministic identity from a 32-byte seed (e.g. a conformance
    /// vector or a value unsealed from the Keychain).
    public init(seed: [UInt8]) throws {
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: Data(seed))
        self.init(privateKey: key)
    }

    private init(privateKey: Curve25519.Signing.PrivateKey) {
        self.privateKey = privateKey
        self.publicKey = [UInt8](privateKey.publicKey.rawRepresentation)
        self.did = Identity.did(from: self.publicKey)
    }

    /// `did:key` for an Ed25519 public key.
    public static func did(from publicKey: [UInt8]) -> DID {
        "did:key:z" + XNetCrypto.base58Encode(multicodec + publicKey)
    }

    /// Recover the Ed25519 public key from a `did:key` (nil if not Ed25519).
    public static func publicKey(from did: DID) -> [UInt8]? {
        let prefix = "did:key:z"
        guard did.hasPrefix(prefix),
              let decoded = XNetCrypto.base58Decode(String(did.dropFirst(prefix.count))),
              decoded.count == 34, Array(decoded.prefix(2)) == multicodec
        else { return nil }
        return Array(decoded.dropFirst(2))
    }

    /// Sign a message with this identity's Ed25519 key.
    public func sign(_ message: [UInt8]) -> [UInt8] {
        [UInt8]((try? privateKey.signature(for: Data(message))) ?? Data())
    }

    /// Verify a signature against a `did:key`.
    public static func verify(_ signature: [UInt8], message: [UInt8], did: DID) -> Bool {
        guard let pub = publicKey(from: did),
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: Data(pub))
        else { return false }
        return key.isValidSignature(Data(signature), for: Data(message))
    }
}
