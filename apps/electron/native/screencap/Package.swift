// swift-tools-version:5.9
// xnet-screencap — macOS screen + camera capture helper (exploration 0414,
// phase 2). Build: `swift build -c release`; the product is bundled by
// electron-builder as an extra resource (see apps/electron/electron-builder.json5).
import PackageDescription

let package = Package(
  name: "xnet-screencap",
  // 12.3 is the ScreenCaptureKit floor; SCShareableContent and
  // SCStream/SCStreamOutput all land there.
  platforms: [.macOS("12.3")],
  targets: [
    .executableTarget(name: "xnet-screencap", path: "Sources")
  ]
)
