import type { CaptionTrack, Cue, LibraryMetadata, LibraryResource } from './types'
import { execFile } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { access } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { assertPublicUrl } from '@xnetjs/core'
import { parseInstagramPage } from './instagram'
import { managedHelperPath, TESTED_EXTRACTOR_VERSION, verifyHelperVersion } from './managed-helper'
import { LibraryProviderError } from './provider-error'
import { parsePostPreview, parsePublicPage, parseTikTokPage } from './public-pages'
import { providerResource } from './source'

const exec = promisify(execFile)
export { TESTED_EXTRACTOR_VERSION } from './managed-helper'
export { LibraryProviderError } from './provider-error'
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined
type PublicFetchOptions = {
  signal?: AbortSignal
  limit?: number
  headers?: Record<string, string>
  timeoutMs?: number
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
}

function requestAtAddress(
  parsed: URL,
  address: { address: string; family: number },
  options: PublicFetchOptions,
  signal: AbortSignal
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = (parsed.protocol === 'https:' ? httpsRequest : httpRequest)(
      parsed,
      {
        signal,
        agent: false,
        family: address.family,
        // Pin a validated address while preserving the original Host and TLS name.
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        headers: {
          'User-Agent': 'xNet-Personal-Library/1',
          ...options.headers,
          'Accept-Encoding': 'identity'
        }
      },
      (incoming) => {
        clearTimeout(connectTimer)
        try {
          const headers = new Headers()
          for (let i = 0; i < incoming.rawHeaders.length; i += 2)
            headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1])
          const status = incoming.statusCode ?? 502
          if (status < 200 || status >= 300) {
            incoming.destroy()
            resolve(new Response(null, { status, headers }))
            return
          }
          if (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity') {
            incoming.destroy()
            reject(
              new LibraryProviderError('Source ignored the uncompressed response request.', 'retry')
            )
            return
          }
          const chunks: Buffer[] = []
          let length = 0
          incoming.on('data', (chunk: Buffer) => {
            length += chunk.length
            if (length > (options.limit ?? 8 * 1024 * 1024)) {
              reject(
                new LibraryProviderError(
                  'Response exceeds the byte limit; it was not truncated.',
                  'blocked'
                )
              )
              incoming.destroy()
              return
            }
            chunks.push(chunk)
          })
          incoming.on('error', reject)
          incoming.on('aborted', () =>
            reject(
              new LibraryProviderError('Source closed before the response completed.', 'retry')
            )
          )
          incoming.on('end', () => {
            try {
              resolve(
                new Response([204, 205].includes(status) ? null : Buffer.concat(chunks), {
                  status,
                  headers
                })
              )
            } catch (error) {
              reject(error)
            }
          })
        } catch (error) {
          incoming.destroy()
          reject(error)
        }
      }
    )
    // A single unreachable CDN address must not consume the entire request deadline.
    const connectTimer = setTimeout(
      () =>
        request.destroy(
          new LibraryProviderError(
            'Source did not respond in time. Check your connection or firewall settings, then retry.',
            'retry'
          )
        ),
      8_000
    )
    request.once('close', () => clearTimeout(connectTimer))
    request.once('error', (error) => {
      clearTimeout(connectTimer)
      reject(error)
    })
    request.end()
  })
}

/** Validate all DNS answers and every redirect, bound the whole request, and send no cookies. */
export async function fetchPublic(
  url: string,
  options: PublicFetchOptions = {}
): Promise<Response> {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  // An owned timer stays live for the entire operation, including redirected requests.
  const deadline = setTimeout(
    () =>
      controller.abort(
        new Error(
          'Source request timed out. Check your connection or firewall settings, then retry.'
        )
      ),
    options.timeoutMs ?? 30_000
  )
  const signal = controller.signal
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      signal.throwIfAborted()
      assertPublicUrl(url)
      const parsed = new URL(url)
      if (parsed.username || parsed.password)
        throw new LibraryProviderError('URLs with embedded credentials are not fetched.', 'blocked')
      const addresses = await untilAborted(
        lookup(parsed.hostname.replace(/^\[|\]$/g, ''), { all: true }),
        signal
      )
      signal.throwIfAborted()
      for (const { address, family } of addresses)
        assertPublicUrl(`https://${family === 6 ? `[${address}]` : address}/`)
      const ordered = [
        ...addresses.filter((entry) => entry.family === 4),
        ...addresses.filter((entry) => entry.family !== 4)
      ]
      let response: Response | undefined
      let lastError: unknown = new LibraryProviderError('Source hostname has no address.', 'retry')
      for (const address of ordered.slice(0, 8)) {
        signal.throwIfAborted()
        try {
          response = await requestAtAddress(parsed, address, options, signal)
          break
        } catch (error) {
          signal.throwIfAborted()
          if (error instanceof LibraryProviderError && error.disposition === 'blocked') throw error
          lastError = error
        }
      }
      if (!response) throw lastError
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) throw new LibraryProviderError('Redirect has no destination.', 'retry')
        url = new URL(location, url).href
        continue
      }
      if ([401, 403, 429].includes(response.status)) {
        const retry = response.headers.get('retry-after')
        const delay =
          retry && /^\d+$/.test(retry)
            ? Number(retry) * 1000
            : retry
              ? Date.parse(retry) - Date.now()
              : 0
        await response.body?.cancel()
        throw new LibraryProviderError(
          `Provider refused this request (HTTP ${response.status}).`,
          response.status === 429 ? 'retry' : 'blocked',
          Date.now() + Math.max(60_000, Number.isFinite(delay) ? delay : 0),
          response.status === 429 ? 'provider' : 'resource',
          parsed.hostname.toLowerCase()
        )
      }
      if (response.status === 404 || response.status === 410) {
        await response.body?.cancel()
        throw new LibraryProviderError('Source is unavailable or no longer public.', 'unavailable')
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new LibraryProviderError(`Provider returned HTTP ${response.status}.`, 'retry')
      }
      return response
    }
    throw new LibraryProviderError('Too many source redirects.', 'blocked')
  } finally {
    clearTimeout(deadline)
    options.signal?.removeEventListener('abort', abort)
  }
}

export async function findExtractor(directory?: string): Promise<string> {
  if (directory && process.platform === 'darwin') {
    try {
      const managed = await managedHelperPath(directory)
      if (managed) return managed
    } catch (error) {
      throw new LibraryProviderError(
        `${error instanceof Error ? error.message : String(error)} Repair the helper in Library → Coverage & gaps.`,
        'blocked'
      )
    }
  }
  const failures: string[] = []
  for (const path of [
    join(homedir(), '.local/bin/yt-dlp'),
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp'
  ]) {
    try {
      await access(path)
    } catch {
      continue
    }
    try {
      await verifyHelperVersion(path)
      return path
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new LibraryProviderError(
    `Video extraction needs yt-dlp ${TESTED_EXTRACTOR_VERSION}. Open Library → Coverage & gaps to install the managed Mac helper.${failures.length ? ` ${failures.join(' ')}` : ''}`,
    'blocked'
  )
}

export function extractorUrl(resource: LibraryResource): string {
  // Only named providers reach the helper: a captured URL cannot select a local file or arbitrary extractor.
  if (resource.platform === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(resource.platformContentId))
    return `https://www.youtube.com/watch?v=${resource.platformContentId}`
  if (resource.platform === 'instagram') {
    // Meta exports may identify a saved record by its numeric fbid. The saved
    // URL carries the post's actual shortcode; the two are not interchangeable.
    const url = new URL(resource.url)
    const shortcode = url.pathname.match(
      /^\/(?:[^/]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)\/?$/
    )?.[1]
    if (['instagram.com', 'www.instagram.com'].includes(url.hostname) && shortcode)
      return `https://www.instagram.com/p/${shortcode}/`
  }
  if (
    (resource.platform === 'x' || resource.platform === 'twitter') &&
    /^\d+$/.test(resource.platformContentId)
  )
    return `https://x.com/i/status/${resource.platformContentId}`
  throw new LibraryProviderError(
    'This resource has no supported native video identifier.',
    'unavailable'
  )
}

export function parseExtractorMetadata(
  value: unknown,
  provider = `yt-dlp/${TESTED_EXTRACTOR_VERSION}`
): LibraryMetadata {
  if (!record(value))
    throw new LibraryProviderError('Extractor returned an invalid metadata object.', 'retry')
  const tracks: CaptionTrack[] = []
  for (const [field, autoGenerated] of [
    ['subtitles', false],
    ['automatic_captions', true]
  ] as const) {
    const source = value[field]
    if (source === undefined) continue
    if (!record(source))
      throw new LibraryProviderError('Extractor caption inventory is malformed.', 'retry')
    for (const [language, items] of Object.entries(source)) {
      if (language === 'live_chat') continue
      if (!Array.isArray(items))
        throw new LibraryProviderError('Extractor caption tracks are malformed.', 'retry')
      for (const item of items) {
        if (!record(item)) continue
        if ((item.ext === 'json3' || item.ext === 'vtt') && typeof item.url === 'string')
          tracks.push({ url: item.url, language, format: item.ext, autoGenerated })
      }
    }
  }
  const title = text(value.title)
  const description = text(value.description)
  const thumbnailUrl = text(value.thumbnail)
  if (!title && !description && !thumbnailUrl)
    throw new LibraryProviderError('Extractor returned no usable metadata.', 'retry')
  return {
    title,
    description,
    thumbnailUrl,
    author: text(value.channel) ?? text(value.uploader),
    language: text(value.language),
    ...(typeof value.duration === 'number' && Number.isFinite(value.duration)
      ? { durationSeconds: value.duration }
      : {}),
    tracks,
    fields: {
      title: title
        ? { state: 'complete' }
        : { state: 'unavailable', reason: 'No source title returned.' },
      description: description
        ? { state: 'complete' }
        : { state: 'unavailable', reason: 'No written description returned.' },
      captions:
        value.subtitles !== undefined || value.automatic_captions !== undefined
          ? { state: 'complete' }
          : { state: 'unavailable', reason: 'Extractor did not report caption availability.' }
    },
    provider,
    fetchedAt: Date.now(),
    evidence: value
  }
}

/** Parse source JSON as data; never evaluate scripts from a fetched page. */
export function parseYouTubePage(html: string, videoId: string): LibraryMetadata {
  const match =
    /(?:var\s+ytInitialPlayerResponse\s*=|(?:window\[)?["']ytInitialPlayerResponse["']\]?\s*[:=])\s*\{/.exec(
      html
    )
  if (!match) throw new LibraryProviderError('YouTube did not return video metadata.', 'retry')
  const start = match.index + match[0].lastIndexOf('{')
  let depth = 0,
    quoted = false,
    escaped = false,
    end = start
  for (; end < html.length; end++) {
    const char = html[end]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) break
  }
  const value: unknown = JSON.parse(html.slice(start, end + 1))
  if (!record(value)) throw new LibraryProviderError('YouTube metadata is malformed.', 'retry')
  const status = record(value.playabilityStatus) ? value.playabilityStatus : {}
  const details = record(value.videoDetails) ? value.videoDetails : {}
  if (details.videoId !== videoId || !text(details.title)) {
    const reason = text(status.reason) ?? 'YouTube did not identify the requested video.'
    throw new LibraryProviderError(
      reason,
      /private|removed|unavailable|deleted/i.test(reason) ? 'unavailable' : 'blocked'
    )
  }
  const images =
    record(details.thumbnail) && Array.isArray(details.thumbnail.thumbnails)
      ? details.thumbnail.thumbnails.filter(record).filter((image) => text(image.url))
      : []
  const thumbnail = images.sort((a, b) => Number(b.width ?? 0) - Number(a.width ?? 0))[0]
  const captions =
    record(value.captions) && record(value.captions.playerCaptionsTracklistRenderer)
      ? value.captions.playerCaptionsTracklistRenderer.captionTracks
      : undefined
  if (
    captions !== undefined &&
    (!Array.isArray(captions) ||
      captions.some((track) => !record(track) || !text(track.baseUrl) || !text(track.languageCode)))
  )
    throw new LibraryProviderError('YouTube caption inventory is malformed.', 'retry')
  const tracks: CaptionTrack[] = Array.isArray(captions)
    ? captions.filter(record).map((track) => {
        const url = new URL(text(track.baseUrl)!)
        url.searchParams.set('fmt', 'json3')
        return {
          url: url.href,
          language: text(track.languageCode)!,
          format: 'json3',
          autoGenerated: track.kind === 'asr'
        }
      })
    : []
  return {
    title: text(details.title),
    description:
      typeof details.shortDescription === 'string' ? details.shortDescription : undefined,
    author: text(details.author),
    thumbnailUrl: thumbnail ? text(thumbnail.url) : undefined,
    ...(Number.isFinite(Number(details.lengthSeconds))
      ? { durationSeconds: Number(details.lengthSeconds) }
      : {}),
    tracks,
    fields: {
      title: { state: 'complete' },
      description:
        typeof details.shortDescription === 'string'
          ? {
              state: 'complete',
              ...(details.shortDescription ? {} : { reason: 'The author supplied no description.' })
            }
          : { state: 'unavailable', reason: 'YouTube returned no description.' },
      captions:
        status.status === 'OK'
          ? { state: 'complete' }
          : { state: 'partial', reason: text(status.reason) ?? 'Video playback is restricted.' }
    },
    provider: 'youtube-page/1',
    fetchedAt: Date.now(),
    evidence: { videoDetails: details, playabilityStatus: status, captions: value.captions }
  }
}

async function fetchYouTubeMetadata(
  resource: LibraryResource,
  signal: AbortSignal
): Promise<LibraryMetadata> {
  const url = extractorUrl(resource)
  let pageError: unknown
  try {
    const response = await fetchPublic(url, { signal, limit: 8 * 1024 * 1024, timeoutMs: 20_000 })
    return parseYouTubePage(await response.text(), resource.platformContentId)
  } catch (error) {
    if (signal.aborted || (error instanceof LibraryProviderError && error.scope === 'provider'))
      throw error
    pageError = error
  }
  // Public oEmbed still supplies useful cards if the full page is unavailable.
  const response = await fetchPublic(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { signal, limit: 128 * 1024, timeoutMs: 15_000 }
  )
  const value: unknown = await response.json()
  if (!record(value) || !text(value.title))
    throw new LibraryProviderError('YouTube preview has no title.', 'retry')
  const reason =
    pageError instanceof Error ? pageError.message : 'Full video metadata is unavailable.'
  return {
    title: text(value.title),
    author: text(value.author_name),
    thumbnailUrl: text(value.thumbnail_url),
    fields: {
      title: { state: 'complete' },
      description: { state: 'partial', reason },
      captions: { state: 'partial', reason }
    },
    provider: 'youtube-oembed/1',
    fetchedAt: Date.now(),
    evidence: value
  }
}

export async function fetchLibraryMetadata(
  resource: LibraryResource,
  signal: AbortSignal,
  helperDirectory?: string
): Promise<LibraryMetadata> {
  return fetchProviderMetadata(providerResource(resource), signal, helperDirectory)
}

async function fetchProviderMetadata(
  resource: LibraryResource,
  signal: AbortSignal,
  helperDirectory?: string
): Promise<LibraryMetadata> {
  if (resource.platform === 'youtube') return fetchYouTubeMetadata(resource, signal)
  if (resource.platform === 'instagram') {
    const url = extractorUrl(resource)
    const shortcode = new URL(url).pathname.split('/')[2]
    try {
      const response = await fetchPublic(`${url}embed/captioned/`, {
        signal,
        limit: 4 * 1024 * 1024,
        timeoutMs: 20_000
      })
      return parseInstagramPage(await response.text(), shortcode)
    } catch (error) {
      if (signal.aborted || (error instanceof LibraryProviderError && error.scope === 'provider'))
        throw error
    }
    const response = await fetchPublic(url, { signal, limit: 4 * 1024 * 1024, timeoutMs: 20_000 })
    return parseInstagramPage(await response.text(), shortcode)
  }
  if (['twitter', 'x'].includes(resource.platform))
    return fetchExtractorMetadata(resource, signal, helperDirectory)
  if (resource.platform === 'tiktok') {
    try {
      const page = await fetchPublic(resource.url, {
        signal,
        limit: 8 * 1024 * 1024,
        timeoutMs: 20_000
      })
      return parseTikTokPage(await page.text(), resource.platformContentId)
    } catch (error) {
      if (signal.aborted || (error instanceof LibraryProviderError && error.scope === 'provider'))
        throw error
    }
    const response = await fetchPublic(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(resource.url)}`,
      { signal, limit: 256 * 1024 }
    )
    return parsePostPreview(await response.json(), 'tiktok')
  }
  if (resource.platform === 'reddit') {
    const response = await fetchPublic(
      `https://www.reddit.com/oembed?url=${encodeURIComponent(resource.url)}`,
      { signal, limit: 256 * 1024 }
    )
    return parsePostPreview(await response.json(), 'reddit')
  }
  const response = await fetchPublic(resource.url, { signal, limit: 8 * 1024 * 1024 })
  return parsePublicPage(await response.text(), resource.url, resource.platform === 'github')
}

export async function fetchExtractorMetadata(
  resource: LibraryResource,
  signal: AbortSignal,
  helperDirectory?: string
): Promise<LibraryMetadata> {
  const helper = await findExtractor(helperDirectory)
  try {
    const result = await exec(
      helper,
      [
        '--ignore-config',
        '--no-plugin-dirs',
        '--no-cache-dir',
        '--no-playlist',
        '--skip-download',
        '--ignore-no-formats-error',
        ...(resource.platform === 'youtube'
          ? ['--extractor-args', 'youtube:skip=translated_subs']
          : []),
        '--dump-single-json',
        '--no-warnings',
        '--no-progress',
        '--socket-timeout',
        '15',
        '--retries',
        '0',
        '--extractor-retries',
        '0',
        '--',
        extractorUrl(resource)
      ],
      {
        signal,
        timeout: 90_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      }
    )
    const metadata = parseExtractorMetadata(JSON.parse(result.stdout))
    if (['x', 'twitter'].includes(resource.platform))
      metadata.fields.title = {
        state: 'partial',
        reason: 'Extractor display label; this platform may not provide a separate authored title.'
      }
    return metadata
  } catch (error) {
    if (signal.aborted) throw error
    if (error instanceof LibraryProviderError) throw error
    const message = error instanceof Error ? error.message : String(error)
    const blocked = /sign in|login|log in|cookies|private|403|429|confirm.*bot/i.test(message)
    throw new LibraryProviderError(message.slice(0, 1800), blocked ? 'blocked' : 'retry')
  }
}

export function chooseTrack(
  tracks: readonly CaptionTrack[],
  preferred = 'en'
): CaptionTrack | null {
  const score = (track: CaptionTrack) =>
    (track.language === preferred
      ? 0
      : track.language.split('-')[0] === preferred.split('-')[0]
        ? 10
        : 20) +
    (track.autoGenerated ? 2 : 0) +
    (track.format === 'json3' ? 0 : 1)
  return (
    [...tracks].sort((a, b) => score(a) - score(b) || a.language.localeCompare(b.language))[0] ??
    null
  )
}

export function parseCaptionBody(body: string, format: 'json3' | 'vtt'): Cue[] {
  if (format === 'json3') {
    const value: unknown = JSON.parse(body)
    if (!record(value) || !Array.isArray(value.events))
      throw new LibraryProviderError('Caption response is not a JSON3 track.', 'retry')
    return value.events.flatMap((event): Cue[] => {
      if (!record(event) || !Array.isArray(event.segs)) return []
      const parts = event.segs
        .map((seg) => (record(seg) && typeof seg.utf8 === 'string' ? seg.utf8 : ''))
        .filter(Boolean)
      if (!parts.length) return []
      if (
        typeof event.tStartMs !== 'number' ||
        !Number.isFinite(event.tStartMs) ||
        event.tStartMs < 0 ||
        (event.dDurationMs !== undefined &&
          (typeof event.dDurationMs !== 'number' ||
            !Number.isFinite(event.dDurationMs) ||
            event.dDurationMs < 0))
      )
        throw new LibraryProviderError('Caption timing is malformed.', 'retry')
      return [
        {
          text: parts.join('').replace(/\s+/g, ' ').trim(),
          startMs: event.tStartMs,
          durationMs: typeof event.dDurationMs === 'number' ? event.dDurationMs : 0
        }
      ]
    })
  }
  if (!body.trimStart().startsWith('WEBVTT'))
    throw new LibraryProviderError('Caption response is not a WebVTT track.', 'retry')
  const time = (raw: string) => {
    const parts = raw.split(':').map(Number)
    if (parts.some((part) => !Number.isFinite(part)))
      throw new LibraryProviderError('Caption timing is malformed.', 'retry')
    return Math.round(parts.reduce((total, part) => total * 60 + part, 0) * 1000)
  }
  return body.split(/\r?\n\s*\r?\n/).flatMap((block): Cue[] => {
    const match = /(?:^|\n)([\d:.]+) --> ([\d:.]+)[^\n]*\n([\s\S]*)/.exec(block)
    if (!match) {
      if (block.includes('-->') && !/^(NOTE|STYLE|REGION)(?:\s|$)/.test(block.trimStart()))
        throw new LibraryProviderError(
          'Caption cue is malformed; the track was not truncated.',
          'retry'
        )
      return []
    }
    const startMs = time(match[1])
    const end = time(match[2])
    if (end < startMs) throw new LibraryProviderError('Caption ends before it starts.', 'retry')
    const words = match[3]
      .replace(/<[^>]*>/g, '')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replace(/\s+/g, ' ')
      .trim()
    return words ? [{ startMs, durationMs: end - startMs, text: words }] : []
  })
}
