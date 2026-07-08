// swift-tools-version:5.9
// xnet-audiotee — macOS system-audio tap helper (exploration 0279, phase 3).
// Build: `swift build -c release` (macOS 14.4+ SDK); the binary is bundled by
// electron-builder as an extra resource (see apps/electron/electron-builder.yml).
import PackageDescription

let package = Package(
  name: "xnet-audiotee",
  // 14.2 floor: AudioHardwareCreateProcessTap/DestroyProcessTap (the whole
  // point of this helper) are macOS 14.2+ APIs; `.v14` (14.0) fails the build
  // under Swift availability checking.
  platforms: [.macOS("14.2")],
  targets: [
    .executableTarget(name: "xnet-audiotee", path: "Sources")
  ]
)
