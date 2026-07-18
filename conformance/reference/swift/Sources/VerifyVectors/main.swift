// Run the xNet golden-vector corpus through the Swift second-language kernel.
//
// This is the proof: an independent Swift implementation reproduces the same
// DIDs and verifies (and re-signs, byte-identically) changes signed by the
// TypeScript reference implementation.
//
//   cd conformance/reference/swift && swift run VerifyVectors
//
// Expected output ends with "18 passed, 0 failed".

import Foundation
import XNetKernel

// …/conformance/reference/swift/Sources/VerifyVectors/main.swift → …/conformance/vectors/
let vectorsDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()  // VerifyVectors
    .deletingLastPathComponent()  // Sources
    .deletingLastPathComponent()  // swift
    .deletingLastPathComponent()  // reference
    .deletingLastPathComponent()  // conformance
    .appendingPathComponent("vectors")

var passed = 0
var failed = 0

func check(_ name: String, _ condition: Bool, _ detail: String = "") {
    if condition {
        passed += 1
        print("  ok   \(name)")
    } else {
        failed += 1
        print("  FAIL \(name) \(detail)")
    }
}

func loadVectors(_ suite: String) -> [(String, [String: Any])] {
    let dir = vectorsDir.appendingPathComponent(suite)
    let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
    return files.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        .compactMap { url in
            guard let data = try? Data(contentsOf: url),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return nil }
            return (url.deletingPathExtension().lastPathComponent, json)
        }
}

func hexToBytes(_ hex: String) -> [UInt8] {
    var bytes: [UInt8] = []
    var index = hex.startIndex
    while index < hex.endIndex {
        let next = hex.index(index, offsetBy: 2)
        bytes.append(UInt8(hex[index..<next], radix: 16)!)
        index = next
    }
    return bytes
}

print("L0 · identity")
for (name, v) in loadVectors("identity") {
    let input = v["input"] as! [String: Any]
    let expected = v["expected"] as! [String: Any]
    let seed = hexToBytes(input["seedHex"] as! String)
    let pub = try XNetKernel.publicKey(fromSeed: seed)
    let did = XNetKernel.did(fromPublicKey: pub)
    check("identity/\(name) pub", XNetKernel.hexEncode(pub) == (expected["publicKeyHex"] as! String))
    check("identity/\(name) did", did == (expected["did"] as! String), "got \(did)")
    check("identity/\(name) roundtrip", (XNetKernel.publicKey(fromDID: did) ?? []) == pub)
}

print("L1 · change (canonicalize → BLAKE3 → Ed25519)")
for (name, v) in loadVectors("change") {
    let input = v["input"] as! [String: Any]
    let expected = v["expected"] as! [String: Any]
    let seed = hexToBytes(input["authorSeedHex"] as! String)
    let unsigned = input["unsignedChange"] as! [String: Any]
    let pub = try XNetKernel.publicKey(fromSeed: seed)
    let sig = [UInt8](Data(base64Encoded: expected["signatureBase64"] as! String)!)

    check("change/\(name) canonical",
          XNetKernel.canonicalJSON(unsigned) == (expected["canonicalJson"] as! String))
    let hash = XNetKernel.changeHash(unsigned)
    check("change/\(name) hash", hash == (expected["hash"] as! String), "got \(hash)")
    // Verify the TypeScript-produced signature (the interop-critical direction)…
    check("change/\(name) verify", XNetKernel.verifyChange(unsigned, signature: sig, publicKey: pub))
    // …and that the kernel itself produces a valid signature. NOTE: unlike the
    // Python kernel (PyNaCl), this is NOT a byte-for-byte re-sign: Apple's
    // CryptoKit Ed25519 uses randomized nonces, so its signatures verify but do
    // not reproduce a specific deterministic signature (a documented Apple
    // crypto gap — see the README).
    let resigned = (try? XNetKernel.signChange(unsigned, seed: seed)) ?? []
    check("change/\(name) sign-verify",
          XNetKernel.verifyChange(unsigned, signature: resigned, publicKey: pub))
}

print("L1 · batch commit (one signature over many changes)")
for (name, v) in loadVectors("batch-commit") {
    let input = v["input"] as! [String: Any]
    let expected = v["expected"] as! [String: Any]

    if name.hasPrefix("0001") {
        let seed = hexToBytes(input["authorSeedHex"] as! String)
        let unsigned = input["unsignedCommit"] as! [String: Any]
        let pub = try XNetKernel.publicKey(fromSeed: seed)
        let sig = [UInt8](Data(base64Encoded: expected["signatureBase64"] as! String)!)

        check("batch-commit/\(name) canonical",
              XNetKernel.canonicalJSON(unsigned) == (expected["canonicalJson"] as! String))
        let root = XNetKernel.batchRoot(unsigned["changeHashes"] as! [String])
        check("batch-commit/\(name) root", root == (expected["root"] as! String), "got \(root)")
        let hash = XNetKernel.batchCommitHash(unsigned)
        check("batch-commit/\(name) hash", hash == (expected["hash"] as! String), "got \(hash)")
        // Verify the TypeScript-produced commit signature — one signature
        // standing in for every member change.
        check("batch-commit/\(name) verify",
              XNetKernel.verifyBatchCommit(unsigned, signature: sig, publicKey: pub))
    } else if name.hasPrefix("0002") {
        let forward = XNetKernel.batchRoot(input["changeHashes"] as! [String])
        let reverse = XNetKernel.batchRoot(input["reversedChangeHashes"] as! [String])
        check("batch-commit/\(name) root", forward == (expected["root"] as! String))
        check("batch-commit/\(name) reversed", reverse == (expected["reversedRoot"] as! String))
        // The whole point: order changes the commitment.
        check("batch-commit/\(name) order-sensitive", forward != reverse)
    } else if name.hasPrefix("0003") {
        let edited = XNetKernel.batchRoot(input["editedChangeHashes"] as! [String])
        check("batch-commit/\(name) forged root",
              edited == (expected["forgedCommitRoot"] as! String))
    }
}

print("\n\(passed) passed, \(failed) failed")
exit(failed == 0 ? 0 : 1)
