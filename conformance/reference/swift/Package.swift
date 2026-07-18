// swift-tools-version:5.9
import PackageDescription

// A second-language reference kernel for the xNet L0 + L1 interop kernel, in
// Swift — the Apple-platform sibling of `conformance/reference/python`. It uses
// CryptoKit for Ed25519 (system framework, deterministic RFC 8032) and a small
// pure-Swift BLAKE3; base58btc and canonical JSON are implemented inline.
let package = Package(
    name: "XNetKernel",
    platforms: [.macOS(.v13)],
    dependencies: [
        // Pure-Swift BLAKE3 (CryptoKit has no BLAKE3). Mirrors the Python
        // kernel's `pip install blake3`.
        .package(url: "https://github.com/nixberg/blake3-swift", from: "0.1.2")
    ],
    targets: [
        .target(
            name: "XNetKernel",
            dependencies: [.product(name: "BLAKE3", package: "blake3-swift")]
        ),
        .executableTarget(
            name: "VerifyVectors",
            dependencies: ["XNetKernel"]
        )
    ]
)
