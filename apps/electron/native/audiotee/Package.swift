// swift-tools-version:5.9
// xnet-audiotee — macOS system-audio tap helper (exploration 0279, phase 3).
// Build: `swift build -c release` (macOS 14.4+ SDK); the binary is bundled by
// electron-builder as an extra resource (see apps/electron/electron-builder.yml).
import PackageDescription

let package = Package(
  name: "xnet-audiotee",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(name: "xnet-audiotee", path: "Sources")
  ]
)
