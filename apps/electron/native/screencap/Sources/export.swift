// xnet-screencap export mode — render an edit decision list to a flat file
// (exploration 0414, phase 5).
//
// Everything up to this point is non-destructive: the cut list is data and the
// player skips spans. Export is the one moment the edit becomes pixels, and it
// happens here rather than through ffmpeg because AVFoundation already ships
// with the OS, uses VideoToolbox for the re-encode, and adds no LGPL source
// distribution obligation or H.264 patent exposure of its own.
//
// `AVMutableComposition` does the work: insert each kept span in order and the
// cuts simply never make it into the timeline. Nothing is re-encoded twice, and
// spans that need no transformation are passed through.
//
// Usage:
//   xnet-screencap export --in <screen.mp4> [--camera <camera.mp4>] \
//     --out <out.mp4> --cuts <cuts.json>
//
// `cuts.json` is the node's `cuts` array; disabled cuts are ignored, exactly as
// the player ignores them.

import AVFoundation
import Foundation

struct ExportCut: Decodable {
  let startMs: Double
  let endMs: Double
  let enabled: Bool
}

/// Merge enabled cuts so an overlapping pair cannot remove the same span twice
/// — the same normalization `activeCuts` performs in @xnetjs/recordings.
func mergedCuts(_ cuts: [ExportCut]) -> [(start: Double, end: Double)] {
  let sorted = cuts
    .filter { $0.enabled && $0.endMs > $0.startMs }
    .sorted { $0.startMs < $1.startMs }

  var merged: [(start: Double, end: Double)] = []
  for cut in sorted {
    if let last = merged.last, cut.startMs <= last.end {
      merged[merged.count - 1].end = max(last.end, cut.endMs)
    } else {
      merged.append((start: cut.startMs, end: cut.endMs))
    }
  }
  return merged
}

/// The spans that survive — what the composition is built from.
func keptSpans(durationMs: Double, cuts: [ExportCut]) -> [(start: Double, end: Double)] {
  var kept: [(start: Double, end: Double)] = []
  var cursor: Double = 0
  for cut in mergedCuts(cuts) {
    if cut.start > cursor { kept.append((start: cursor, end: min(cut.start, durationMs))) }
    cursor = max(cursor, cut.end)
    if cursor >= durationMs { break }
  }
  if cursor < durationMs { kept.append((start: cursor, end: durationMs)) }
  return kept.filter { $0.end > $0.start }
}

private func time(_ ms: Double) -> CMTime {
  CMTime(seconds: ms / 1000, preferredTimescale: 600)
}

func runExport(arguments: [String]) -> Never {
  var input: URL?
  var output: URL?
  var cutsPath: URL?

  var args = arguments
  while let flag = args.first {
    args.removeFirst()
    switch flag {
    case "--in":
      guard let value = args.first else { fail("--in requires a path") }
      args.removeFirst()
      input = URL(fileURLWithPath: value)
    case "--out":
      guard let value = args.first else { fail("--out requires a path") }
      args.removeFirst()
      output = URL(fileURLWithPath: value)
    case "--cuts":
      guard let value = args.first else { fail("--cuts requires a path") }
      args.removeFirst()
      cutsPath = URL(fileURLWithPath: value)
    // Accepted and ignored: the camera track is composited at playback, and
    // burning it in is a separate feature, not part of applying an EDL.
    case "--camera":
      if !args.isEmpty { args.removeFirst() }
    default:
      fail("unknown export argument: \(flag)")
    }
  }

  guard let input, let output else { fail("export requires --in and --out") }

  // `let`, not `var`: the export runs inside a Task, and Swift forbids
  // capturing a mutable local in concurrently-executing code.
  let cuts: [ExportCut] = {
    guard let cutsPath else { return [] }
    guard let data = try? Data(contentsOf: cutsPath) else {
      fail("cannot read cuts file at \(cutsPath.path)")
    }
    guard let decoded = try? JSONDecoder().decode([ExportCut].self, from: data) else {
      // A malformed cut list must not silently export the unedited source —
      // that would hand back a video still containing what the user removed.
      fail("cannot parse cuts file — refusing to export an unedited file")
    }
    return decoded
  }()

  let asset = AVURLAsset(url: input)
  let semaphore = DispatchSemaphore(value: 0)

  Task {
    let duration: CMTime
    let videoTracks: [AVAssetTrack]
    let audioTracks: [AVAssetTrack]
    do {
      duration = try await asset.load(.duration)
      videoTracks = try await asset.loadTracks(withMediaType: .video)
      audioTracks = try await asset.loadTracks(withMediaType: .audio)
    } catch {
      fail("cannot read source: \(error.localizedDescription)")
    }

    guard let sourceVideo = videoTracks.first else { fail("source has no video track") }

    let composition = AVMutableComposition()
    guard
      let video = composition.addMutableTrack(
        withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else { fail("cannot create composition video track") }
    let audio = audioTracks.isEmpty
      ? nil
      : composition.addMutableTrack(
        withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)

    // Preserve orientation — a rotated source exported flat is a bug users
    // notice immediately.
    if let transform = try? await sourceVideo.load(.preferredTransform) {
      video.preferredTransform = transform
    }

    let durationMs = CMTimeGetSeconds(duration) * 1000
    let spans = keptSpans(durationMs: durationMs, cuts: cuts)
    guard !spans.isEmpty else { fail("every span is cut — nothing to export") }

    var cursor = CMTime.zero
    for span in spans {
      let range = CMTimeRange(start: time(span.start), end: time(span.end))
      do {
        try video.insertTimeRange(range, of: sourceVideo, at: cursor)
        if let audio, let sourceAudio = audioTracks.first {
          try audio.insertTimeRange(range, of: sourceAudio, at: cursor)
        }
      } catch {
        fail("cannot insert span \(span.start)–\(span.end): \(error.localizedDescription)")
      }
      cursor = CMTimeAdd(cursor, range.duration)
    }

    guard
      let session = AVAssetExportSession(
        asset: composition, presetName: AVAssetExportPresetHighestQuality)
    else { fail("cannot create export session") }

    try? FileManager.default.removeItem(at: output)
    session.outputURL = output
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true

    let progressTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
    progressTimer.schedule(deadline: .now() + 1, repeating: 1)
    progressTimer.setEventHandler {
      emit(["event": "progress", "fraction": Double(session.progress)])
    }
    progressTimer.resume()

    await session.export()
    progressTimer.cancel()

    switch session.status {
    case .completed:
      emit([
        "event": "exported",
        "path": output.path,
        "durationMs": Int(CMTimeGetSeconds(cursor) * 1000)
      ])
      semaphore.signal()
    default:
      fail("export failed: \(session.error?.localizedDescription ?? "unknown error")")
    }
  }

  semaphore.wait()
  exit(0)
}
