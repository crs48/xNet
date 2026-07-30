/**
 * Opt-in audio retention (exploration 0279, phase 4).
 *
 * The default is Granola's norm: audio is NEVER persisted. When the user
 * opts in (`MeetingConsentSettings.retainAudio`), the captured PCM is encoded
 * as WAV and handed to the content-addressed BlobStore; only the returned
 * file reference (CID + metadata) goes on the `MeetingTranscript.audio`
 * property — bytes never touch the change log (0249 hard rule).
 *
 * WAV (16-bit PCM) keeps this dependency-free; it is also what the polish
 * pass and diarizers re-consume without a decoder.
 */

import type { MeetingChannel } from '@xnetjs/data'

/** The `file()` property value shape (`FileRef` in @xnetjs/data). */
export interface RetainedAudioRef {
  cid: string
  name: string
  mimeType: string
  size: number
}

/** The one BlobStore method this module needs (content-addressed put). */
export type PutBlob = (bytes: Uint8Array) => Promise<{ cid: string }>

/** Encode mono float PCM as a 16-bit WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, Math.round(clamped * 0x7fff), true)
    offset += 2
  }

  return new Uint8Array(buffer)
}

/**
 * Persist one channel's recording to the blob store (opt-in only — callers
 * MUST check `MeetingConsentSettings.retainAudio` first) and return the
 * `file` property value for the transcript node.
 */
export async function persistMeetingAudio(
  putBlob: PutBlob,
  channel: MeetingChannel,
  samples: Float32Array,
  sampleRate: number
): Promise<RetainedAudioRef> {
  const bytes = encodeWav(samples, sampleRate)
  const { cid } = await putBlob(bytes)
  return {
    cid,
    name: `meeting-${channel}.wav`,
    mimeType: 'audio/wav',
    size: bytes.byteLength
  }
}
