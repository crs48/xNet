import type { LibraryResource } from './types'

/** A citation keeps its imported identity while its URL selects the public provider. */
export function providerResource(resource: LibraryResource): LibraryResource {
  const url = new URL(resource.url)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const youtube =
    host === 'youtu.be'
      ? url.pathname.split('/')[1]
      : ['youtube.com', 'm.youtube.com'].includes(host)
        ? url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1]
        : null
  if (youtube && /^[\w-]{11}$/.test(youtube))
    return { ...resource, platform: 'youtube', platformContentId: youtube }
  const instagram =
    host === 'instagram.com'
      ? url.pathname.match(/^\/(?:[^/]+\/)?(?:p|reels?|tv)\/([\w-]+)\/?$/)?.[1]
      : null
  if (instagram) return { ...resource, platform: 'instagram', platformContentId: instagram }
  const tweet = ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)
    ? url.pathname.match(/\/(?:i\/web|[^/]+)\/status\/(\d+)(?:\/|$)/)?.[1]
    : null
  if (tweet) return { ...resource, platform: 'x', platformContentId: tweet }
  const tiktok = ['tiktok.com', 'm.tiktok.com', 'tiktokv.com'].includes(host)
    ? url.pathname.match(/\/video\/(\d+)(?:\/|$)/)?.[1]
    : null
  if (tiktok)
    return {
      ...resource,
      platform: 'tiktok',
      platformContentId: tiktok,
      url: `https://www.tiktok.com/@_/video/${tiktok}`
    }
  if (host === 'github.com' && /^\/[^/]+\/[^/]+\/?$/.test(url.pathname))
    return { ...resource, platform: 'github' }
  if (['reddit.com', 'old.reddit.com', 'redd.it'].includes(host))
    return { ...resource, platform: 'reddit' }
  return resource
}

export function queueProvider(resource: LibraryResource): string {
  if (!/^https?:\/\//.test(resource.url)) return resource.platform
  const target = providerResource(resource)
  if (['youtube', 'instagram', 'github', 'reddit', 'tiktok', 'x'].includes(target.platform))
    return target.platform
  // An archive's provenance is not the host serving its outbound citations.
  return `web:${new URL(resource.url).hostname.toLowerCase().replace(/^www\./, '')}`
}
