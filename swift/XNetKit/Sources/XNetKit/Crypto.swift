import Foundation
import BLAKE3

/// Low-level, dependency-light primitives shared by identity and the change log.
/// These mirror the proven conformance reference kernel exactly.
public enum XNetCrypto {
    /// BLAKE3-256 of `data`, hex-encoded (lowercase) — the change-hash digest.
    public static func blake3Hex(_ data: [UInt8]) -> String {
        var hasher = BLAKE3()
        hasher.absorb(contentsOf: data)
        return hexEncode(hasher.squeeze(outputByteCount: 32))
    }

    public static func hexEncode(_ bytes: [UInt8]) -> String {
        bytes.map { String(format: "%02x", $0) }.joined()
    }

    public static func hexDecode(_ hex: String) -> [UInt8] {
        var bytes: [UInt8] = []
        var i = hex.startIndex
        while i < hex.endIndex {
            let j = hex.index(i, offsetBy: 2)
            if let b = UInt8(hex[i..<j], radix: 16) { bytes.append(b) }
            i = j
        }
        return bytes
    }

    static let base58Alphabet = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")

    /// Standard base58btc (Bitcoin alphabet) encode.
    public static func base58Encode(_ bytes: [UInt8]) -> String {
        var zeros = 0
        while zeros < bytes.count && bytes[zeros] == 0 { zeros += 1 }
        var input = bytes
        var digits: [UInt8] = []
        var start = zeros
        while start < input.count {
            var remainder = 0
            for k in start..<input.count {
                let acc = remainder * 256 + Int(input[k])
                input[k] = UInt8(acc / 58)
                remainder = acc % 58
            }
            digits.append(UInt8(remainder))
            if input[start] == 0 { start += 1 }
        }
        var result = String(repeating: "1", count: zeros)
        for d in digits.reversed() { result.append(base58Alphabet[Int(d)]) }
        return result
    }

    /// Inverse of `base58Encode`.
    public static func base58Decode(_ string: String) -> [UInt8]? {
        var zeros = 0
        for ch in string { if ch == base58Alphabet[0] { zeros += 1 } else { break } }
        var input: [Int] = []
        for ch in string {
            guard let v = base58Alphabet.firstIndex(of: ch) else { return nil }
            input.append(v)
        }
        var bytes: [UInt8] = []
        var start = zeros
        while start < input.count {
            var remainder = 0
            for k in start..<input.count {
                let acc = remainder * 58 + input[k]
                input[k] = acc / 256
                remainder = acc % 256
            }
            bytes.append(UInt8(remainder))
            if input[start] == 0 { start += 1 }
        }
        let trimmed = Array(bytes.reversed().drop(while: { $0 == 0 }))
        return Array(repeating: 0, count: zeros) + trimmed
    }
}
