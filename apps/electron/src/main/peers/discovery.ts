import type { PeerDiscovery } from '@xnetjs/workbench/peer-chat'
import { net } from 'electron'
import { decodeInvite } from './protocol'

/** A profile can publish an invitation; the pinned xNet key still requires consent. */
export async function discoverBluesky(input: string): Promise<PeerDiscovery> {
  const handle = input
    .trim()
    .replace(/^@/, '')
    .replace(/^https:\/\/bsky.app\/profile\//, '')
    .replace(/\/$/, '')
    .toLowerCase()
  if (!/^(?=.{3,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(handle))
    throw new Error('Enter a Bluesky handle, such as you.bsky.social.')
  const get = async (
    method: string,
    key: string,
    value: string
  ): Promise<Record<string, unknown>> => {
    const url = new URL(`https://public.api.bsky.app/xrpc/${method}`)
    url.searchParams.set(key, value)
    const response = await net.fetch(url.href, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000)
    })
    if (!response.ok)
      throw new Error(
        response.status === 400
          ? 'That Bluesky profile could not be found.'
          : 'Bluesky is unavailable. Try again shortly.'
      )
    const text = await response.text()
    if (text.length > 512_000) throw new Error('Bluesky returned an oversized profile.')
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Bluesky returned an invalid profile.')
    return data as Record<string, unknown>
  }
  const profile = await get('app.bsky.actor.getProfile', 'actor', handle)
  if (typeof profile.did !== 'string' || typeof profile.handle !== 'string')
    throw new Error('Bluesky returned an incomplete profile.')
  const texts = [typeof profile.description === 'string' ? profile.description : '']
  const pinned = profile.pinnedPost as { uri?: unknown } | undefined
  if (
    typeof pinned?.uri === 'string' &&
    pinned.uri.startsWith(`at://${profile.did}/app.bsky.feed.post/`)
  ) {
    const result = await get('app.bsky.feed.getPosts', 'uris', pinned.uri)
    const posts = result.posts as
      | {
          author?: { did?: string }
          record?: { text?: string; embed?: { external?: { uri?: string } } }
        }[]
      | undefined
    const post = Array.isArray(posts)
      ? posts.find((entry) => entry.author?.did === profile.did)
      : undefined
    if (typeof post?.record?.text === 'string') texts.push(post.record.text)
    if (typeof post?.record?.embed?.external?.uri === 'string')
      texts.push(post.record.embed.external.uri)
  }
  const links =
    texts.join('\n').match(/(?:xnet:\/\/peer|https:\/\/xnet\.fyi\/join\/?)[#][A-Za-z0-9_-]+/g) ?? []
  let link: string | undefined
  for (const candidate of links) {
    // An expired published link is not a live contact address.
    try {
      decodeInvite(candidate)
      link = candidate
      break
    } catch {
      /* Try the next published link. */
    }
  }
  return {
    name: typeof profile.displayName === 'string' ? profile.displayName : profile.handle,
    handle: profile.handle,
    url: `https://bsky.app/profile/${encodeURIComponent(profile.handle)}`,
    link
  }
}
