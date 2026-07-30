// A minimal, second-language implementation of the xNet L0 + L1 interop kernel.
//
// This mirrors `conformance/reference/python/xnet_kernel.py` and exists to prove
// the same thing on the Apple platform: that the written spec in
// docs/specs/protocol/ — not the TypeScript source — is sufficient to derive the
// same DIDs and verify (and reproduce, byte-for-byte) TypeScript-signed changes.
//
// Primitives:
//   - CryptoKit Curve25519.Signing  (Ed25519, deterministic per RFC 8032)
//   - BLAKE3                         (nixberg/blake3-swift)
//   - base58btc + canonical JSON     (implemented inline below)
//
// Spec references are noted inline as [L0 §n] / [L1 §n].

import Foundation
import CryptoKit
import BLAKE3

public enum XNetKernel {
    // Multicodec prefix for an Ed25519 public key (varint 0xed 0x01). [L0 §1]
    static let ed25519Multicodec: [UInt8] = [0xed, 0x01]

    // MARK: - L0 · identity

    /// Derive the 32-byte Ed25519 public key from a 32-byte seed.
    public static func publicKey(fromSeed seed: [UInt8]) throws -> [UInt8] {
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: Data(seed))
        return [UInt8](key.publicKey.rawRepresentation)
    }

    /// did:key = "did:key:z" + base58btc(0xed01 || ed25519_public_key). [L0 §1]
    public static func did(fromPublicKey publicKey: [UInt8]) -> String {
        "did:key:z" + base58btcEncode(ed25519Multicodec + publicKey)
    }

    /// Inverse of `did(fromPublicKey:)`; returns nil for a non-Ed25519 did:key. [L0 §1]
    public static func publicKey(fromDID did: String) -> [UInt8]? {
        let prefix = "did:key:z"
        guard did.hasPrefix(prefix) else { return nil }
        guard let decoded = base58btcDecode(String(did.dropFirst(prefix.count))) else { return nil }
        guard decoded.count == 34, Array(decoded.prefix(2)) == ed25519Multicodec else { return nil }
        return Array(decoded.dropFirst(2))
    }

    // MARK: - L1 · change (canonicalize → BLAKE3 → Ed25519)

    /// Canonical JSON per [L1 §6]: keys sorted recursively, no insignificant
    /// whitespace, arrays in order, UTF-8 bytes — matching JS
    /// `JSON.stringify(sortKeysRecursively(value))`.
    public static func canonicalJSON(_ value: Any) -> String {
        if value is NSNull { return "null" }
        if let n = value as? NSNumber {
            // Distinguish a JSON boolean from a numeric NSNumber.
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return n.boolValue ? "true" : "false" }
            // The protocol's hashed fields are integers (lamport, wallTime, …).
            return String(n.int64Value)
        }
        if let s = value as? String { return encodeJSONString(s) }
        if let arr = value as? [Any] { return "[" + arr.map(canonicalJSON).joined(separator: ",") + "]" }
        if let dict = value as? [String: Any] {
            let body = dict.keys.sorted().map { key in
                encodeJSONString(key) + ":" + canonicalJSON(dict[key]!)
            }.joined(separator: ",")
            return "{" + body + "}"
        }
        return "null"
    }

    /// The content id of an unsigned change: "cid:blake3:" + hex(BLAKE3(canonical)).
    /// Legacy changes (protocolVersion 0/absent) drop the field before hashing;
    /// xnet/1.0 (protocolVersion 4) keeps it. [L1 §6]
    public static func changeHash(_ unsignedChange: [String: Any]) -> String {
        var toHash = unsignedChange
        if let pv = toHash["protocolVersion"] as? NSNumber, pv.int64Value == 0 {
            toHash.removeValue(forKey: "protocolVersion")
        } else if toHash["protocolVersion"] == nil || toHash["protocolVersion"] is NSNull {
            toHash.removeValue(forKey: "protocolVersion")
        }
        let bytes = Array(canonicalJSON(toHash).utf8)
        var hasher = BLAKE3()
        hasher.absorb(contentsOf: bytes)
        let digest = hasher.squeeze(outputByteCount: 32)
        return "cid:blake3:" + hexEncode(digest)
    }

    /// Ed25519 signature over the UTF-8 bytes of the hash STRING. [L1 §6, L0 §2]
    public static func signChange(_ unsignedChange: [String: Any], seed: [UInt8]) throws -> [UInt8] {
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: Data(seed))
        let message = Data(changeHash(unsignedChange).utf8)
        return [UInt8](try key.signature(for: message))
    }

    /// Verify a change's Ed25519 signature against an author public key. [L1 §6]
    public static func verifyChange(
        _ unsignedChange: [String: Any], signature: [UInt8], publicKey: [UInt8]
    ) -> Bool {
        guard let pub = try? Curve25519.Signing.PublicKey(rawRepresentation: Data(publicKey))
        else { return false }
        let message = Data(changeHash(unsignedChange).utf8)
        return pub.isValidSignature(Data(signature), for: message)
    }

    // MARK: - batch commits (one signature over many changes) [L1 §6.1]

    /// Root over an ORDERED list of change hashes: "cid:blake3:" +
    /// hex(BLAKE3(hashes joined by "\n")). Order is part of the commitment,
    /// so a permuted batch yields a different root. [L1 §6.1]
    public static func batchRoot(_ changeHashes: [String]) -> String {
        let bytes = Array(changeHashes.joined(separator: "\n").utf8)
        var hasher = BLAKE3()
        hasher.absorb(contentsOf: bytes)
        return "cid:blake3:" + hexEncode(hasher.squeeze(outputByteCount: 32))
    }

    /// A commit is hashed with the SAME recipe as a change: canonical JSON,
    /// BLAKE3, "cid:blake3:" prefix. Unlike a change there is no legacy
    /// unversioned form. [L1 §6.1]
    public static func batchCommitHash(_ unsignedCommit: [String: Any]) -> String {
        let bytes = Array(canonicalJSON(unsignedCommit).utf8)
        var hasher = BLAKE3()
        hasher.absorb(contentsOf: bytes)
        return "cid:blake3:" + hexEncode(hasher.squeeze(outputByteCount: 32))
    }

    /// A commit is valid iff its root matches its own ordered hash list AND
    /// its signature matches its author. [L1 §6.1]
    public static func verifyBatchCommit(
        _ unsignedCommit: [String: Any], signature: [UInt8], publicKey: [UInt8]
    ) -> Bool {
        guard let hashes = unsignedCommit["changeHashes"] as? [String],
              let root = unsignedCommit["root"] as? String,
              batchRoot(hashes) == root,
              let pub = try? Curve25519.Signing.PublicKey(rawRepresentation: Data(publicKey))
        else { return false }
        let message = Data(batchCommitHash(unsignedCommit).utf8)
        return pub.isValidSignature(Data(signature), for: message)
    }

    /// Membership rules that keep a commit from being weaker than a per-change
    /// signature: the change must hash to its claimed hash, that hash must be
    /// in the commit's list, and the change's author must be the commit's
    /// author (so a commit cannot launder someone else's change). [L1 §6.1]
    public static func batchMemberOK(
        _ unsignedChange: [String: Any], claimedHash: String, commit: [String: Any]
    ) -> Bool {
        guard changeHash(unsignedChange) == claimedHash,
              let hashes = commit["changeHashes"] as? [String],
              hashes.contains(claimedHash),
              let changeAuthor = unsignedChange["authorDID"] as? String,
              let commitAuthor = commit["authorDID"] as? String
        else { return false }
        return changeAuthor == commitAuthor
    }

    // MARK: - inline encodings

    /// JSON string encoding matching JS `JSON.stringify` (escape ", \\, and the
    /// control characters; pass UTF-8 through — no \\u for non-ASCII).
    static func encodeJSONString(_ s: String) -> String {
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

    public static func hexEncode(_ bytes: [UInt8]) -> String {
        bytes.map { String(format: "%02x", $0) }.joined()
    }

    static let base58Alphabet = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")

    /// Standard base58btc (Bitcoin alphabet) encode: repeated base-256 → base-58
    /// long division, preserving each leading zero byte as a leading '1'.
    static func base58btcEncode(_ bytes: [UInt8]) -> String {
        var zeros = 0
        while zeros < bytes.count && bytes[zeros] == 0 { zeros += 1 }
        var input = bytes
        var digits: [UInt8] = []
        var start = zeros
        while start < input.count {
            var remainder = 0
            for i in start..<input.count {
                let acc = remainder * 256 + Int(input[i])
                input[i] = UInt8(acc / 58)
                remainder = acc % 58
            }
            digits.append(UInt8(remainder))
            if input[start] == 0 { start += 1 }
        }
        var result = String(repeating: "1", count: zeros)
        for digit in digits.reversed() { result.append(base58Alphabet[Int(digit)]) }
        return result
    }

    /// Inverse of `base58btcEncode`: base-58 → base-256 long division.
    static func base58btcDecode(_ string: String) -> [UInt8]? {
        var zeros = 0
        for char in string {
            if char == base58Alphabet[0] { zeros += 1 } else { break }
        }
        var input: [Int] = []
        for char in string {
            guard let value = base58Alphabet.firstIndex(of: char) else { return nil }
            input.append(value)
        }
        var bytes: [UInt8] = []
        var start = zeros
        while start < input.count {
            var remainder = 0
            for i in start..<input.count {
                let acc = remainder * 58 + input[i]
                input[i] = acc / 256
                remainder = acc % 256
            }
            bytes.append(UInt8(remainder))
            if input[start] == 0 { start += 1 }
        }
        // `bytes` is little-endian; the outer loop may have appended spurious
        // most-significant zeros (when the byte count < the base-58 digit count),
        // so trim leading zeros after reversing, then restore the real leading
        // zero bytes encoded as leading '1's.
        let trimmed = Array(bytes.reversed().drop(while: { $0 == 0 }))
        return Array(repeating: 0, count: zeros) + trimmed
    }
}
