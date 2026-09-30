import type { CaptionTrack, Cue, LibraryMetadata, LibraryResource } from './types'
import { execFile } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { access } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { assertPublicUrl, TaggedError } from '@xnetjs/core'
import { resolveExternalReferenceMetadata } from '@xnetjs/data'

const exec = promisify(execFile)
export const TESTED_EXTRACTOR_VERSION = '2026.07.04'
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined
export class LibraryProviderError extends TaggedError {
  readonly _tag = 'LibraryProviderError'
  constructor(
    message: string,
    readonly disposition: 'retry' | 'blocked' | 'unavailable',
    readonly retryAt?: number
  ) {
    super(message)
  }
}

/** Validate each redirect before requesting it, cap bytes while streaming, and send no browser cookies. */
export async function fetchPublic(
  url: string,
  options: { signal?: AbortSignal; limit?: number; headers?: Record<string, string> } = {}
): Promise<Response> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000)
  for (let redirects = 0; redirects <= 5; redirects++) {
    assertPublicUrl(url)
    const parsed = new URL(url)
    if (parsed.username || parsed.password)
      throw new LibraryProviderError('URLs with embedded credentials are not fetched.', 'blocked')
    const addresses = await lookup(parsed.hostname.replace(/^\[|\]$/g, ''), { all: true })
    for (const { address, family } of addresses)
      assertPublicUrl(`https://${family === 6 ? `[${address}]` : address}/`)
    const address = addresses.find((entry) => entry.family === 4) ?? addresses[0]
    if (!address) throw new LibraryProviderError('Source hostname has no address.', 'retry')
    const response = await new Promise<Response>((resolve, reject) => {
      const request = (parsed.protocol === 'https:' ? httpsRequest : httpRequest)(
        parsed,
        {
          signal,
          agent: false,
          family: address.family,
          // Pin the validated address while preserving the original Host and TLS name.
          lookup: (_host, _options, callback) => callback(null, address.address, address.family),
          headers: {
            'User-Agent': 'xNet-Personal-Library/1',
            ...options.headers,
            'Accept-Encoding': 'identity'
          }
        },
        (incoming) => {
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
              incoming.destroy(
                new LibraryProviderError(
                  'Response exceeds the byte limit; it was not truncated.',
                  'blocked'
                )
              )
              return
            }
            chunks.push(chunk)
          })
          incoming.on('error', reject)
          incoming.on('end', () =>
            resolve(
              new Response([204, 205].includes(status) ? null : Buffer.concat(chunks), {
                status,
                headers
              })
            )
          )
        }
      )
      request.on('error', reject)
      request.end()
    })
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
        Date.now() + Math.max(60_000, Number.isFinite(delay) ? delay : 0)
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
}

export async function findExtractor(): Promise<string> {
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
    const result = await exec(path, ['--ignore-config', '--no-plugin-dirs', '--version'], {
      timeout: 10_000,
      maxBuffer: 65536
    })
    if (result.stdout.trim() !== TESTED_EXTRACTOR_VERSION)
      throw new LibraryProviderError(
        `This build was tested with yt-dlp ${TESTED_EXTRACTOR_VERSION}; found ${result.stdout.trim()}. Update the provider integration before retrying.`,
        'blocked'
      )
    return path
  }
  throw new LibraryProviderError(
    `Video extraction needs yt-dlp ${TESTED_EXTRACTOR_VERSION}. Install the tested helper to fetch descriptions and caption tracks.`,
    'blocked'
  )
}

export function extractorUrl(resource: LibraryResource): string {
  // Only named providers reach the helper: a captured URL cannot select a local file or arbitrary extractor.
  if (resource.platform === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(resource.platformContentId))
    return `https://www.youtube.com/watch?v=${resource.platformContentId}`
  if (resource.platform === 'instagram' && /^[A-Za-z0-9_-]+$/.test(resource.platformContentId))
    return `https://www.instagram.com/p/${resource.platformContentId}/`
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

export async function fetchLibraryMetadata(
  resource: LibraryResource,
  signal: AbortSignal
): Promise<LibraryMetadata> {
  if (['youtube', 'instagram', 'twitter', 'x'].includes(resource.platform)) {
    const helper = await findExtractor()
    try {
      const result = await exec(
        helper,
        [
          '--ignore-config',
          '--no-plugin-dirs',
          '--no-cache-dir',
          '--no-playlist',
          '--skip-download',
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
      if (
        resource.platform === 'instagram' ||
        resource.platform === 'x' ||
        resource.platform === 'twitter'
      )
        metadata.fields.title = {
          state: 'partial',
          reason:
            'Extractor display label; this platform may not provide a separate authored title.'
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
  if (resource.platform === 'github') {
    const url = new URL(resource.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (
      url.hostname !== 'github.com' ||
      parts.length !== 2 ||
      parts.some((part) => !/^[\w.-]+$/.test(part))
    )
      throw new LibraryProviderError('Invalid repository URL.', 'blocked')
    const response = await fetchPublic(`https://api.github.com/repos/${parts.join('/')}`, {
      signal,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    })
    const repo: unknown = await response.json()
    if (!record(repo) || typeof repo.full_name !== 'string')
      throw new LibraryProviderError('Repository metadata is malformed.', 'retry')
    let readme = ''
    let readmeReason: string | undefined
    try {
      readme = await (
        await fetchPublic(`https://api.github.com/repos/${parts.join('/')}/readme`, {
          signal,
          headers: { Accept: 'application/vnd.github.raw+json' }
        })
      ).text()
    } catch (error) {
      if (signal.aborted) throw error
      readmeReason = error instanceof Error ? error.message : String(error)
    }
    const description = [
      text(repo.description),
      Array.isArray(repo.topics) ? repo.topics.join(' ') : '',
      text(repo.language),
      readme
    ]
      .filter(Boolean)
      .join('\n\n')
    return {
      title: repo.full_name,
      description,
      author: record(repo.owner) ? text(repo.owner.login) : undefined,
      thumbnailUrl: `https://opengraph.githubassets.com/1/${parts.join('/')}`,
      fields: {
        title: { state: 'complete' },
        description: description
          ? { state: 'complete' }
          : { state: 'unavailable', reason: 'Repository has no description.' },
        readme: readme
          ? { state: 'complete' }
          : { state: 'unavailable', reason: readmeReason ?? 'No README returned.' }
      },
      provider: 'github-rest/2022-11-28',
      fetchedAt: Date.now(),
      evidence: { repo, readme, readmeReason }
    }
  }
  const result = await resolveExternalReferenceMetadata({
    url: resource.url,
    allowOEmbed: true,
    allowOpenGraph: true,
    signal,
    fetcher: (url) => fetchPublic(url, { signal })
  })
  if (result.status !== 'resolved')
    throw new LibraryProviderError(
      result.reason,
      result.status === 'blocked'
        ? 'blocked'
        : result.status === 'unavailable'
          ? 'unavailable'
          : 'retry'
    )
  const metadata = result.metadata
  return {
    title: metadata.title ?? undefined,
    description: metadata.description ?? undefined,
    author: metadata.authorName ?? undefined,
    thumbnailUrl: metadata.imageUrl ?? undefined,
    fields: {
      title: metadata.title
        ? { state: 'complete' }
        : { state: 'unavailable', reason: 'Page has no title metadata.' },
      description: metadata.description
        ? {
            state: 'partial',
            reason: 'Page preview metadata; article text has not been extracted.'
          }
        : { state: 'unavailable', reason: 'Page has no description metadata.' }
    },
    provider: metadata.source,
    fetchedAt: Date.now(),
    evidence: result
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
