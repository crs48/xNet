// xnet-screencap — macOS screen + camera capture helper (exploration 0414,
// phase 2).
//
// Captures the screen with ScreenCaptureKit and, optionally, the camera with
// AVCaptureDevice, encodes both with VideoToolbox via AVAssetWriter, and
// writes each to its own file. Two tracks, never one composite: the camera
// bubble's position is a playback property, so compositing at record time
// would bake in a decision the user can still change (0414 §Key Findings 2).
//
// Frames never leave this process. Electron's main process spawns the helper,
// reads status lines, and is handed two file paths at the end — the renderer
// sees no pixels at all, which is what makes the Electron shell a non-issue
// for capture cost.
//
// Protocol (consumed by apps/electron/src/main/screen-capture.ts) — the same
// convention `xnet-audiotee` uses:
//   stderr — one JSON status line per event:
//            {"event":"ready","width":W,"height":H,"screenPath":"…","cameraPath":"…"}
//            {"event":"progress","durationMs":N,"droppedFrames":N}
//            {"event":"stopped","durationMs":N,"droppedFrames":N}
//            {"event":"error","message":"…","fatal":true|false}
//   stdout — unused (video goes to files; a pipe would add two copies for
//            nothing). Kept open so the parent can detect exit.
//   SIGTERM/SIGINT — finalize the files cleanly, emit `stopped`, exit 0.
//
// Usage: xnet-screencap --out <dir> [--display <id>] [--camera] [--fps <n>]

import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

// ── Status protocol ─────────────────────────────────────────────────────────

let stderrQueue = DispatchQueue(label: "fyi.xnet.screencap.stderr")

func emit(_ object: [String: Any]) {
  stderrQueue.sync {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
      let line = String(data: data, encoding: .utf8),
      let out = (line + "\n").data(using: .utf8)
    else { return }
    FileHandle.standardError.write(out)
  }
}

/// A fatal error the parent cannot recover from: report and exit non-zero so a
/// dead helper is never mistaken for a finished recording.
func fail(_ message: String) -> Never {
  emit(["event": "error", "message": message, "fatal": true])
  exit(1)
}

/// A non-fatal problem worth surfacing (a dropped frame burst, a camera that
/// vanished). Recording continues; the parent decides what to tell the user.
func warn(_ message: String) {
  emit(["event": "error", "message": message, "fatal": false])
}

// ── Arguments ───────────────────────────────────────────────────────────────

struct Options {
  var outputDir: URL
  var displayID: CGDirectDisplayID?
  var camera: Bool
  var fps: Int
}

// `export` is a subcommand, not a flag: it shares the helper's binary and
// status protocol but nothing else — no capture, no permissions, no TCC.
if CommandLine.arguments.dropFirst().first == "export" {
  runExport(arguments: Array(CommandLine.arguments.dropFirst(2)))
}

func parseOptions() -> Options {
  var outputDir: URL?
  var displayID: CGDirectDisplayID?
  var camera = false
  var fps = 30

  var args = Array(CommandLine.arguments.dropFirst())
  while let flag = args.first {
    args.removeFirst()
    switch flag {
    case "--out":
      guard let value = args.first else { fail("--out requires a directory") }
      args.removeFirst()
      outputDir = URL(fileURLWithPath: value, isDirectory: true)
    case "--display":
      guard let value = args.first, let parsed = UInt32(value) else {
        fail("--display requires a numeric display id")
      }
      args.removeFirst()
      displayID = CGDirectDisplayID(parsed)
    case "--camera":
      camera = true
    case "--fps":
      guard let value = args.first, let parsed = Int(value), parsed > 0, parsed <= 120 else {
        fail("--fps requires a number between 1 and 120")
      }
      args.removeFirst()
      fps = parsed
    default:
      fail("unknown argument: \(flag)")
    }
  }

  guard let outputDir else { fail("--out is required") }
  return Options(outputDir: outputDir, displayID: displayID, camera: camera, fps: fps)
}

// ── Writers ─────────────────────────────────────────────────────────────────

/// One AVAssetWriter per track. `startSession` is deferred to the first frame
/// so the two tracks share a wall-clock origin even though the camera and the
/// display start delivering at slightly different moments.
final class TrackWriter {
  let url: URL
  private let writer: AVAssetWriter
  private let input: AVAssetWriterInput
  private var started = false
  private(set) var firstPts: CMTime = .invalid
  private(set) var lastPts: CMTime = .invalid
  private(set) var dropped = 0

  init(url: URL, width: Int, height: Int, fps: Int) throws {
    self.url = url
    writer = try AVAssetWriter(outputURL: url, fileType: .mp4)

    // VideoToolbox does the encoding. Software encoding at 1440p would hammer
    // the CPU regardless of how fast the machine is (0414 §External Research),
    // so hardware acceleration is requested explicitly rather than hoped for.
    var compression: [String: Any] = [
      AVVideoAverageBitRateKey: max(2_000_000, width * height * fps / 8),
      AVVideoMaxKeyFrameIntervalKey: fps * 2,
      AVVideoExpectedSourceFrameRateKey: fps
    ]
    compression[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel

    let settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: compression
    ]

    input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = true
    guard writer.canAdd(input) else { throw NSError(domain: "screencap", code: 1) }
    writer.add(input)
    guard writer.startWriting() else {
      throw writer.error ?? NSError(domain: "screencap", code: 2)
    }
  }

  func append(_ buffer: CMSampleBuffer) {
    let pts = CMSampleBufferGetPresentationTimeStamp(buffer)
    if !started {
      writer.startSession(atSourceTime: pts)
      firstPts = pts
      started = true
    }
    guard input.isReadyForMoreMediaData else {
      // The encoder is behind. Dropping is correct — buffering would grow
      // without bound — but it is counted and reported, never silent.
      dropped += 1
      return
    }
    if input.append(buffer) {
      lastPts = pts
    } else {
      dropped += 1
    }
  }

  var durationMs: Int {
    guard started, lastPts.isValid, firstPts.isValid else { return 0 }
    return Int(CMTimeGetSeconds(CMTimeSubtract(lastPts, firstPts)) * 1000)
  }

  func finish(_ completion: @escaping () -> Void) {
    guard started else {
      // Nothing was ever written. Cancel rather than leave a zero-byte file
      // that looks like a recording.
      writer.cancelWriting()
      try? FileManager.default.removeItem(at: url)
      completion()
      return
    }
    input.markAsFinished()
    writer.finishWriting(completionHandler: completion)
  }
}

// ── Screen capture ──────────────────────────────────────────────────────────

final class ScreenOutput: NSObject, SCStreamOutput, SCStreamDelegate {
  let writer: TrackWriter

  init(writer: TrackWriter) {
    self.writer = writer
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, CMSampleBufferGetNumSamples(buffer) > 0 else { return }

    // ScreenCaptureKit delivers idle frames with a status attachment; only
    // `.complete` carries new pixels.
    if let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false)
      as? [[SCStreamFrameInfo: Any]],
      let raw = attachments.first?[.status] as? Int,
      let status = SCFrameStatus(rawValue: raw),
      status != .complete
    {
      return
    }

    writer.append(buffer)
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    // A revoked Screen Recording grant lands here mid-session. The parent must
    // hear about it — a recording that stops early is truncated, not finished.
    emit(["event": "error", "message": "screen stream stopped: \(error.localizedDescription)", "fatal": true])
  }
}

// ── Camera capture ──────────────────────────────────────────────────────────

final class CameraOutput: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let writer: TrackWriter

  init(writer: TrackWriter) {
    self.writer = writer
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput buffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    writer.append(buffer)
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

let options = parseOptions()

do {
  try FileManager.default.createDirectory(at: options.outputDir, withIntermediateDirectories: true)
} catch {
  fail("cannot create output directory: \(error.localizedDescription)")
}

let screenURL = options.outputDir.appendingPathComponent("screen.mp4")
let cameraURL = options.outputDir.appendingPathComponent("camera.mp4")

var screenWriter: TrackWriter?
var cameraWriter: TrackWriter?
var stream: SCStream?
var session: AVCaptureSession?
var screenOutput: ScreenOutput?
var cameraOutput: CameraOutput?

let semaphore = DispatchSemaphore(value: 0)

Task {
  let content: SCShareableContent
  do {
    content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
  } catch {
    // The overwhelmingly common cause is a missing Screen Recording grant.
    fail("cannot list shareable content — Screen Recording permission is required (\(error.localizedDescription))")
  }

  guard
    let display = options.displayID.flatMap({ id in content.displays.first { $0.displayID == id } })
      ?? content.displays.first
  else {
    fail("no display available to capture")
  }

  let configuration = SCStreamConfiguration()
  configuration.width = display.width
  configuration.height = display.height
  configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
  configuration.showsCursor = true
  configuration.queueDepth = 6

  do {
    screenWriter = try TrackWriter(
      url: screenURL, width: display.width, height: display.height, fps: options.fps)
  } catch {
    fail("cannot open screen writer: \(error.localizedDescription)")
  }

  let filter = SCContentFilter(display: display, excludingWindows: [])
  let output = ScreenOutput(writer: screenWriter!)
  screenOutput = output
  let scStream = SCStream(filter: filter, configuration: configuration, delegate: output)
  stream = scStream

  do {
    try scStream.addStreamOutput(
      output, type: .screen, sampleHandlerQueue: DispatchQueue(label: "fyi.xnet.screencap.screen"))
    try await scStream.startCapture()
  } catch {
    fail("cannot start screen capture: \(error.localizedDescription)")
  }

  // Camera is best-effort: a missing or denied camera degrades to a
  // screen-only recording, loudly, rather than failing the whole session.
  if options.camera {
    if let device = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: device)
    {
      let captureSession = AVCaptureSession()
      captureSession.sessionPreset = .hd1280x720
      if captureSession.canAddInput(input) {
        captureSession.addInput(input)
        let videoOutput = AVCaptureVideoDataOutput()
        videoOutput.alwaysDiscardsLateVideoFrames = true
        do {
          cameraWriter = try TrackWriter(url: cameraURL, width: 1280, height: 720, fps: options.fps)
          let delegate = CameraOutput(writer: cameraWriter!)
          cameraOutput = delegate
          videoOutput.setSampleBufferDelegate(
            delegate, queue: DispatchQueue(label: "fyi.xnet.screencap.camera"))
          if captureSession.canAddOutput(videoOutput) {
            captureSession.addOutput(videoOutput)
            captureSession.startRunning()
            session = captureSession
          } else {
            warn("camera output could not be attached — recording screen only")
          }
        } catch {
          warn("cannot open camera writer: \(error.localizedDescription) — recording screen only")
        }
      } else {
        warn("camera input could not be attached — recording screen only")
      }
    } else {
      warn("no camera available or permission denied — recording screen only")
    }
  }

  emit([
    "event": "ready",
    "width": display.width,
    "height": display.height,
    "fps": options.fps,
    "screenPath": screenURL.path,
    "cameraPath": session != nil ? cameraURL.path : NSNull()
  ])

  semaphore.signal()
}

semaphore.wait()

// Periodic progress so the parent can show elapsed time and notice a stall
// without polling the filesystem.
let progressTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
progressTimer.schedule(deadline: .now() + 1, repeating: 1)
progressTimer.setEventHandler {
  guard let writer = screenWriter else { return }
  emit([
    "event": "progress",
    "durationMs": writer.durationMs,
    "droppedFrames": writer.dropped + (cameraWriter?.dropped ?? 0)
  ])
}
progressTimer.resume()

func shutdown() {
  progressTimer.cancel()
  session?.stopRunning()

  let group = DispatchGroup()
  if let stream {
    group.enter()
    Task {
      try? await stream.stopCapture()
      group.leave()
    }
  }
  group.wait()

  let durationMs = screenWriter?.durationMs ?? 0
  let dropped = (screenWriter?.dropped ?? 0) + (cameraWriter?.dropped ?? 0)

  let finishGroup = DispatchGroup()
  for writer in [screenWriter, cameraWriter].compactMap({ $0 }) {
    finishGroup.enter()
    writer.finish { finishGroup.leave() }
  }
  finishGroup.wait()

  emit(["event": "stopped", "durationMs": durationMs, "droppedFrames": dropped])
  exit(0)
}

// Signal sources must outlive the loop that installs them, or they are
// deallocated and SIGTERM kills the process before the files are finalized —
// which is exactly how you ship a truncated recording that looks complete.
var signalSources: [DispatchSourceSignal] = []

for signalNumber in [SIGTERM, SIGINT] {
  signal(signalNumber, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
  source.setEventHandler { shutdown() }
  source.resume()
  signalSources.append(source)
}

RunLoop.main.run()
