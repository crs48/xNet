import type { SocialPlatform } from '../schemas/constants'
import { createSocialNodeId } from './ids'

/** Preserve generic query/fragment meaning; collapse only known provider resource aliases. */
export function resourceIdentityForUrl(raw: string): {
  id: string
  url: string
  platform: SocialPlatform
  nativeId: string
  kind: 'video' | 'post' | 'link'
} {
  const parsed = new URL(raw.trim())
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error('Save an HTTP or HTTPS URL without embedded credentials.')
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const youtube =
    host === 'youtu.be'
      ? parsed.pathname.split('/')[1]
      : ['youtube.com', 'm.youtube.com'].includes(host)
        ? parsed.searchParams.get('v') ||
          parsed.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1]
        : null
  if (youtube && /^[\w-]{11}$/.test(youtube))
    return {
      id: createSocialNodeId('content', ['youtube', 'video', youtube]),
      platform: 'youtube',
      nativeId: youtube,
      kind: 'video',
      url: `https://www.youtube.com/watch?v=${youtube}`
    }
  const instagram =
    host === 'instagram.com'
      ? parsed.pathname.match(/^\/(?:p|reel|tv)\/([\w-]+)(?:\/|$)/)?.[1]
      : null
  if (instagram)
    return {
      id: createSocialNodeId('content', ['instagram', 'post', instagram]),
      platform: 'instagram',
      nativeId: instagram,
      kind: 'post',
      url: `https://www.instagram.com/p/${instagram}/`
    }
  const tweet = ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)
    ? parsed.pathname.match(/\/(?:i\/web|[^/]+)\/status\/(\d+)(?:\/|$)/)?.[1]
    : null
  if (tweet)
    return {
      id: createSocialNodeId('content', ['x', 'tweet', tweet]),
      platform: 'x',
      nativeId: tweet,
      kind: 'post',
      url: `https://x.com/i/status/${tweet}`
    }
  const url = parsed.href
  return {
    id: createSocialNodeId('content', ['generic', 'url', url]),
    platform: 'generic',
    nativeId: url,
    kind: 'link',
    url
  }
}
