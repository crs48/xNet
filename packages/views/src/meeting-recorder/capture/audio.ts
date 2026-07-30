/**
 * Browser audio capture for the meeting recorder (exploration 0279).
 *
 * Two channels, one PCM pipeline: getUserMedia (the "me" mic channel, with
 * echo cancellation ON so the far end doesn't transcribe twice) and
 * getDisplayMedia (the "them" channel — Electron loopback when the preload
 * bridge armed it, Chrome tab audio otherwise). Each stream runs through an
 * AudioWorklet (ScriptProcessor fallback) that emits mono Float32Array PCM,
 * downsampled to 16 kHz for the capture session.
 *
 * Audio never persists: PCM chunks flow straight into VAD → engine and are
 * dropped. Denial/failure of system audio returns null — mic-only is a
 * degraded mode, not an error (0279).
 */

import { getMeetingsBridge } from './bridge.js'
import { MEETING_SAMPLE_RATE, mixToMono, resamplePcm } from './pcm.js'

export type PcmSink = (samples: Float32Array) => void

export interface CaptureHandle {
  /** Tear down tracks, nodes, and the AudioContext. Idempotent. */
  stop(): Promise<void>
}

/**
 * Inline AudioWorklet processor: forwards each 128-frame quantum's channels
 * to the main thread. Loaded from a Blob URL so no bundler asset config is
 * needed (same trick as the OPFS worker probes).
 */
const PCM_WORKLET_SOURCE = `
class XnetMeetingPcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input.length > 0 && input[0].length > 0) {
      this.port.postMessage(input.map((channel) => channel.slice()))
    }
    return true
  }
}
registerProcessor('xnet-meeting-pcm-tap', XnetMeetingPcmTap)
`

interface PcmPipeline {
  stop(): Promise<void>
}

/** Wire a MediaStream's audio through a worklet/ScriptProcessor into `onPcm`. */
async function startPcmPipeline(stream: MediaStream, onPcm: PcmSink): Promise<PcmPipeline> {
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const emit = (channels: Float32Array[]): void => {
    const mono = mixToMono(channels)
    onPcm(resamplePcm(mono, context.sampleRate, MEETING_SAMPLE_RATE))
  }

  let cleanupNode: () => void
  try {
    const workletUrl = URL.createObjectURL(
      new Blob([PCM_WORKLET_SOURCE], { type: 'application/javascript' })
    )
    try {
      await context.audioWorklet.addModule(workletUrl)
    } finally {
      URL.revokeObjectURL(workletUrl)
    }
    const tap = new AudioWorkletNode(context, 'xnet-meeting-pcm-tap')
    tap.port.onmessage = (event: MessageEvent<Float32Array[]>) => emit(event.data)
    source.connect(tap)
    // Keep the node in the graph without producing sound.
    const sink = context.createGain()
    sink.gain.value = 0
    tap.connect(sink)
    sink.connect(context.destination)
    cleanupNode = () => {
      tap.port.onmessage = null
      tap.disconnect()
      sink.disconnect()
    }
  } catch {
    // ScriptProcessor fallback (deprecated but universal).
    const processor = context.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => emit([event.inputBuffer.getChannelData(0).slice()])
    source.connect(processor)
    processor.connect(context.destination)
    cleanupNode = () => {
      processor.onaudioprocess = null
      processor.disconnect()
    }
  }

  let stopped = false
  return {
    async stop() {
      if (stopped) return
      stopped = true
      cleanupNode()
      source.disconnect()
      for (const track of stream.getTracks()) track.stop()
      await context.close().catch(() => undefined)
    }
  }
}

/**
 * Capture the microphone ("me" channel). Echo cancellation / noise
 * suppression / AGC stay ON — the far-end audio already has its own channel,
 * and bleeding it into the mic double-transcribes (see `detectChannelBleed`).
 * Throws when the mic permission is denied — that is a real error state.
 */
export async function startMicCapture(onPcm: PcmSink): Promise<CaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  })
  const pipeline = await startPcmPipeline(stream, onPcm)
  return { stop: () => pipeline.stop() }
}

/**
 * Capture system/tab audio ("them" channel). On Electron this arms the
 * loopback so the display-media stream carries everything the machine plays;
 * on Chrome web it is one shared tab's audio. Returns null on denial or when
 * the stream has no audio track — the caller degrades to mic-only.
 * `onEnded` fires when the user stops sharing mid-meeting (degrade, again).
 */
export async function startSystemCapture(
  onPcm: PcmSink,
  onEnded?: () => void
): Promise<CaptureHandle | null> {
  const bridge = getMeetingsBridge()
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) return null

  try {
    if (bridge) await bridge.armLoopback()
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })

    // Only the audio matters; stop video immediately so no frame is captured.
    for (const track of stream.getVideoTracks()) {
      track.stop()
      stream.removeTrack(track)
    }
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) {
      for (const track of stream.getTracks()) track.stop()
      if (bridge) await bridge.disarmLoopback().catch(() => undefined)
      return null
    }
    if (onEnded) audioTrack.addEventListener('ended', onEnded, { once: true })

    const pipeline = await startPcmPipeline(stream, onPcm)
    return {
      async stop() {
        await pipeline.stop()
        if (bridge) await bridge.disarmLoopback().catch(() => undefined)
      }
    }
  } catch {
    // Denied the picker, or the platform refused audio — mic-only degrade.
    if (bridge) await bridge.disarmLoopback().catch(() => undefined)
    return null
  }
}
