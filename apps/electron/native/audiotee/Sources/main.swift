// xnet-audiotee — macOS system-audio tap helper (exploration 0279, phase 3).
//
// Captures the machine's system audio output with a Core Audio process tap
// (macOS 14.2+, formalized 14.4) — the clean path that prompts the
// audio-capture TCC category (NSAudioCaptureUsageDescription) instead of the
// heavier Screen Recording permission ScreenCaptureKit requires. Pattern
// follows insidegui/AudioCap and AudioTee.
//
// Protocol (consumed by apps/electron/src/main/core-audio-tap.ts):
//   stderr — one JSON status line per event: {"event":"ready","sampleRate":N}
//            or {"event":"error","message":"..."}
//   stdout — raw interleaved Float32 PCM frames (native byte order), mono
//            (downmixed), at the reported sample rate. SIGTERM stops cleanly.

import AudioToolbox
import CoreAudio
import Foundation

func emit(_ object: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: object),
    let line = String(data: data, encoding: .utf8)
  {
    FileHandle.standardError.write((line + "\n").data(using: .utf8)!)
  }
}

func fail(_ message: String) -> Never {
  emit(["event": "error", "message": message])
  exit(1)
}

// ── 1. Create a tap over the whole system output (all processes). ───────────
let tapDescription = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
tapDescription.uuid = UUID()
tapDescription.muteBehavior = .unmuted
var tapID = AudioObjectID(kAudioObjectUnknown)
var status = AudioHardwareCreateProcessTap(tapDescription, &tapID)
guard status == noErr else { fail("AudioHardwareCreateProcessTap failed (\(status))") }

// ── 2. Wrap it in a private aggregate device so an IOProc can read it. ──────
let aggregateUID = UUID().uuidString
let description: [String: Any] = [
  kAudioAggregateDeviceNameKey: "xnet-audiotee",
  kAudioAggregateDeviceUIDKey: aggregateUID,
  kAudioAggregateDeviceIsPrivateKey: true,
  kAudioAggregateDeviceIsStackedKey: false,
  kAudioAggregateDeviceTapAutoStartKey: true,
  kAudioAggregateDeviceSubDeviceListKey: [] as [[String: Any]],
  kAudioAggregateDeviceTapListKey: [
    [
      kAudioSubTapDriftCompensationKey: true,
      kAudioSubTapUIDKey: tapDescription.uuid.uuidString
    ]
  ]
]
var aggregateID = AudioObjectID(kAudioObjectUnknown)
status = AudioHardwareCreateAggregateDevice(description as CFDictionary, &aggregateID)
guard status == noErr else { fail("AudioHardwareCreateAggregateDevice failed (\(status))") }

// ── 3. Read the tap's stream format (sample rate + channels). ───────────────
var streamDescription = AudioStreamBasicDescription()
var propertySize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
var formatAddress = AudioObjectPropertyAddress(
  mSelector: kAudioTapPropertyFormat,
  mScope: kAudioObjectPropertyScopeGlobal,
  mElement: kAudioObjectPropertyElementMain
)
status = AudioObjectGetPropertyData(tapID, &formatAddress, 0, nil, &propertySize, &streamDescription)
guard status == noErr else { fail("could not read tap format (\(status))") }
let channels = Int(streamDescription.mChannelsPerFrame)
let sampleRate = streamDescription.mSampleRate

// ── 4. IOProc: downmix to mono Float32 and stream to stdout. ────────────────
// NOTE: AVAudioEngine silently reads nothing from tap-backed aggregates — the
// raw IOProc is required (AudioCap/AudioTee lesson, baked into 0279).
var ioProcID: AudioDeviceIOProcID?
let stdout = FileHandle.standardOutput
status = AudioDeviceCreateIOProcIDWithBlock(&ioProcID, aggregateID, nil) {
  _, inputData, _, _, _ in
  let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inputData))
  for buffer in buffers {
    guard let data = buffer.mData else { continue }
    let sampleCount = Int(buffer.mDataByteSize) / MemoryLayout<Float32>.size
    let samples = data.bindMemory(to: Float32.self, capacity: sampleCount)
    let frames = sampleCount / max(1, channels)
    var mono = [Float32](repeating: 0, count: frames)
    if channels <= 1 {
      for i in 0..<frames { mono[i] = samples[i] }
    } else {
      for frame in 0..<frames {
        var sum: Float32 = 0
        for ch in 0..<channels { sum += samples[frame * channels + ch] }
        mono[frame] = sum / Float32(channels)
      }
    }
    mono.withUnsafeBufferPointer { pointer in
      stdout.write(Data(buffer: pointer))
    }
  }
}
guard status == noErr, let procID = ioProcID else { fail("IOProc creation failed (\(status))") }

status = AudioDeviceStart(aggregateID, procID)
guard status == noErr else { fail("AudioDeviceStart failed (\(status)) — audio-capture TCC denied?") }

emit(["event": "ready", "sampleRate": sampleRate, "channels": 1])

// ── 5. Run until SIGTERM/SIGINT, then tear down in reverse order. ────────────
let stop = {
  AudioDeviceStop(aggregateID, procID)
  AudioDeviceDestroyIOProcID(aggregateID, procID)
  AudioHardwareDestroyAggregateDevice(aggregateID)
  AudioHardwareDestroyProcessTap(tapID)
  exit(0)
}
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
termSource.setEventHandler(handler: stop)
termSource.resume()
let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
intSource.setEventHandler(handler: stop)
intSource.resume()

RunLoop.main.run()
