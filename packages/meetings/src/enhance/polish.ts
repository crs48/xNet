/**
 * Post-meeting transcript polish (exploration 0279, phase 2).
 *
 * Live transcription optimizes for latency (small chunks, real-time models).
 * When the user opted into retaining audio, the meeting can be re-transcribed
 * afterwards at higher quality — e.g. through a cheap batch tier (Groq
 * whisper-large-v3-turbo via the `byo` engine) or a bigger local model.
 *
 * Requires retained audio: without the blob there is nothing to re-run, and
 * `polishTranscript` says so instead of silently returning the old segments.
 */

import type { MeetingChannel, MeetingSegment } from '@xnetjs/data'
import type { AudioInput, DictationEngine } from '@xnetjs/dictation'

export interface RetainedChannelAudio {
  channel: MeetingChannel
  /** The retained (encoded or PCM) audio for this channel. */
  audio: AudioInput
}

export interface PolishResult {
  segments: MeetingSegment[]
  fullText: string
  engineId: string
  modelId: string
}

/**
 * Re-transcribe retained channel audio with a (better) engine and rebuild the
 * segment list. Channel attribution survives because channels are re-run
 * separately; segment timings come from the engine when it reports them, else
 * each channel collapses to one segment spanning the clip.
 */
export async function polishTranscript(
  engine: DictationEngine,
  retained: RetainedChannelAudio[],
  options: { language?: string; signal?: AbortSignal } = {}
): Promise<PolishResult> {
  if (retained.length === 0) {
    throw new Error(
      'polishTranscript needs retained audio — this meeting kept none (audio retention is opt-in)'
    )
  }

  const segments: MeetingSegment[] = []
  let engineId = engine.descriptor.id
  let modelId = ''

  for (const { channel, audio } of retained) {
    const result = await engine.transcribe(audio, {
      language: options.language,
      signal: options.signal
    })
    engineId = result.engineId
    modelId = result.modelId
    if (result.segments?.length) {
      for (const s of result.segments) {
        if (s.text.trim().length === 0) continue
        segments.push({ channel, text: s.text, startMs: s.startMs, endMs: s.endMs })
      }
    } else if (result.text.trim().length > 0) {
      segments.push({ channel, text: result.text, startMs: 0, endMs: result.durationMs })
    }
  }

  segments.sort((a, b) => a.startMs - b.startMs)
  return {
    segments,
    fullText: segments.map((s) => s.text).join(' '),
    engineId,
    modelId
  }
}
