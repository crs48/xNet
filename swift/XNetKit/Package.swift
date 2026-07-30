// swift-tools-version:5.10
import PackageDescription

// XNetKit — a native Swift SDK for xNet's local-first graph database.
//
// This package realizes the user-facing vision of exploration 0210: define
// schemas in Swift, query the database in Swift, and bind results into a
// SwiftUI re-rendering loop — built directly on the conformance-pinned protocol
// kernel (so it interoperates with the TypeScript reference). The collaborative
// document body (Yjs) and live hub transport are out of scope for this slice
// (see the README / exploration 0210 Phases 1-3).
let package = Package(
    name: "XNetKit",
    platforms: [.macOS(.v14), .iOS(.v17), .visionOS(.v1)],
    products: [
        .library(name: "XNetKit", targets: ["XNetKit"]),
        .executable(name: "xnet-demo", targets: ["xnet-demo"]),
        .executable(name: "xnet-sync-demo", targets: ["xnet-sync-demo"])
    ],
    dependencies: [
        // Pure-Swift BLAKE3 (CryptoKit has none) — same dependency the
        // conformance reference kernel uses.
        .package(url: "https://github.com/nixberg/blake3-swift", from: "0.1.2")
    ],
    targets: [
        .target(
            name: "XNetKit",
            dependencies: [.product(name: "BLAKE3", package: "blake3-swift")],
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
        .executableTarget(name: "xnet-demo", dependencies: ["XNetKit"]),
        .executableTarget(name: "xnet-sync-demo", dependencies: ["XNetKit"]),
        .testTarget(name: "XNetKitTests", dependencies: ["XNetKit"])
    ]
)
