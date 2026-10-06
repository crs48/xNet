import type { CaptionTrack, Cue, LibraryResource } from './types'
import { LibraryProviderError } from './provider-error'
import { chooseTrack, fetchExtractorMetadata, fetchPublic, parseCaptionBody } from './providers'
import { providerResource } from './source'

type RetrievedTranscript = { track: CaptionTrack; cues: Cue[]; raw: string; provider: string }
type TranscriptResult =
  | { status: 'available'; value: RetrievedTranscript }
  | { status: 'unavailable'; reason: string }

async function readTracks(
  tracks: readonly CaptionTrack[],
  preferred: string,
  provider: string,
  signal: AbortSignal
): Promise<RetrievedTranscript> {
  const remaining = [...tracks]
  let failure: unknown = new LibraryProviderError(
    'No readable caption track was discovered.',
    'unavailable'
  )
  for (let attempt = 0; attempt < 4 && remaining.length; attempt++) {
    const track = chooseTrack(remaining, preferred)!
    remaining.splice(remaining.indexOf(track), 1)
    try {
      const response = await fetchPublic(track.url, {
        signal,
        limit: 32 * 1024 * 1024,
        timeoutMs: 20_000
      })
      const raw = await response.text()
      const cues = raw.trim() ? parseCaptionBody(raw, track.format) : []
      if (!cues.length)
        throw new LibraryProviderError('The source returned an empty caption track.', 'blocked')
      return { track, raw, cues, provider }
    } catch (error) {
      if (signal.aborted || (error instanceof LibraryProviderError && error.scope === 'provider'))
        throw error
      failure = error
    }
  }
  throw failure
}

/** Caption discovery and retrieval may need a fresh provider response after signed URLs expire. */
export async function fetchLibraryTranscript(
  resource: LibraryResource,
  signal: AbortSignal,
  helperDirectory?: string
): Promise<TranscriptResult> {
  const target = providerResource(resource)
  const metadata = resource.metadata
  const preferred = metadata?.language || 'en'
  const tracks = metadata?.tracks ?? []
  let failure: unknown
  if (tracks.length) {
    try {
      return {
        status: 'available',
        value: await readTracks(tracks, preferred, metadata!.provider, signal)
      }
    } catch (error) {
      if (signal.aborted || (error instanceof LibraryProviderError && error.scope === 'provider'))
        throw error
      failure = error
    }
  }
  if (target.platform === 'youtube') {
    const fresh = await fetchExtractorMetadata(target, signal, helperDirectory)
    if (fresh.tracks?.length)
      return {
        status: 'available',
        value: await readTracks(fresh.tracks, preferred, fresh.provider, signal)
      }
    if (fresh.fields.captions?.state !== 'complete')
      throw new LibraryProviderError(
        fresh.fields.captions?.reason ?? 'Caption discovery did not complete.',
        'blocked'
      )
    if (failure) throw failure
    return {
      status: 'unavailable',
      reason: 'The source reported no readable caption tracks. Local transcription has not run.'
    }
  }
  if (failure) throw failure
  if (metadata?.fields.captions?.state !== 'complete')
    throw new LibraryProviderError(
      metadata?.fields.captions?.reason ?? 'Caption discovery has not succeeded.',
      'blocked'
    )
  return {
    status: 'unavailable',
    reason: 'No readable caption track was discovered. Local transcription has not run.'
  }
}
