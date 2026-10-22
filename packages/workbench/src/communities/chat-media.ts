import { validateExternalUrl } from '@xnetjs/core'
import { findLinkTokens } from '@xnetjs/ui'

export type { PreviewAsset, ChatLinkResolution, ResolveChatLink } from './chat-media-contract'

export function publicChatUrl(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 4096 || !validateExternalUrl(raw).valid) return null
  const url = new URL(raw)
  if (url.username || url.password) return null
  return url.href
}

/** Code examples and inline code must never trigger a preview request. */
export function chatUrls(content: string): string[] {
  const prose = content.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g, '')
  return [
    ...new Set(
      findLinkTokens(prose).flatMap((token) => {
        const url = token.type === 'url' ? publicChatUrl(token.href) : null
        return url ? [url] : []
      })
    )
  ].slice(0, 3)
}

export function youtubeEmbed(raw: string): string | null {
  const safe = publicChatUrl(raw)
  if (!safe) return null
  const url = new URL(safe)
  const host = url.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
  else if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)
  ) {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else id = /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1] ?? null
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null
  const start = url.searchParams.get('start') ?? url.searchParams.get('t') ?? ''
  const seconds = /^\d+$/.test(start)
    ? Number(start)
    : (/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/
        .exec(start)
        ?.slice(1)
        .reduce((total, part, index) => total + Number(part ?? 0) * [3600, 60, 1][index], 0) ?? 0)
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&start=${Math.min(seconds, 86400)}&origin=https%3A%2F%2Fxnet.fyi`
}

const extensionTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json'
}
export function fileMimeType(name: string, mime: string): string {
  const normalized = mime.split(';')[0].trim().toLowerCase()
  return !normalized || normalized === 'application/octet-stream'
    ? (extensionTypes[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream')
    : normalized
}
export function previewKind(mime: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file' {
  if (/^image\/(png|jpeg|webp|gif|avif)$/.test(mime)) return 'image'
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(mime)) return 'video'
  if (/^audio\/(mpeg|mp4|wav|ogg|webm|x-wav|flac)$/.test(mime)) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (/^(text\/(plain|markdown|csv)|application\/json)$/.test(mime)) return 'text'
  return 'file'
}
