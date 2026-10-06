import type { LibraryMetadata } from './types'
import type { DefaultTreeAdapterTypes } from 'parse5'
import { parse, serializeOuter } from 'parse5'
import { LibraryProviderError } from './provider-error'

type Element = DefaultTreeAdapterTypes.Element
type Node = DefaultTreeAdapterTypes.Node
const attribute = (node: Element, name: string) =>
  node.attrs.find((entry) => entry.name === name)?.value
const hasClass = (node: Element, name: string) =>
  (attribute(node, 'class') ?? '').split(/\s+/).includes(name)

function elements(root: Node): Element[] {
  const found: Element[] = []
  const pending = [root]
  while (pending.length) {
    const node = pending.pop()!
    if ('tagName' in node) found.push(node)
    if ('childNodes' in node) pending.push(...[...node.childNodes].reverse())
  }
  return found
}

function readableText(root: Node): string {
  const parts: string[] = []
  const pending = [root]
  while (pending.length) {
    const node = pending.pop()!
    if ('tagName' in node) {
      if (
        ['script', 'style', 'template'].includes(node.tagName) ||
        hasClass(node, 'CaptionUsername') ||
        hasClass(node, 'CaptionComments')
      )
        continue
      if (node.tagName === 'br') parts.push('\n')
    }
    if ('value' in node && node.nodeName === '#text') parts.push(node.value)
    if ('childNodes' in node) pending.push(...[...node.childNodes].reverse())
  }
  return parts.join('').trim()
}

function identifiesPost(value: string | undefined, shortcode: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value, 'https://www.instagram.com')
    return (
      ['instagram.com', 'www.instagram.com'].includes(url.hostname) &&
      url.pathname.match(/^\/(?:[^/]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)\/?$/)?.[1] === shortcode
    )
  } catch {
    return false
  }
}

/** Read public post markup as data, without executing scripts or loading embedded media. */
export function parseInstagramPage(html: string, shortcode: string): LibraryMetadata {
  const nodes = elements(parse(html))
  const meta = (name: string) =>
    nodes
      .filter((node) => node.tagName === 'meta')
      .find((node) => attribute(node, 'property') === name)
  const metaValue = (name: string) => {
    const node = meta(name)
    return node ? attribute(node, 'content') : undefined
  }
  const media = nodes.find((node) => hasClass(node, 'EmbeddedMedia'))
  const embedded = !!media && identifiesPost(attribute(media, 'href'), shortcode)
  if (media && !embedded)
    throw new LibraryProviderError('Instagram returned a different post in its embed.', 'blocked')
  if (!embedded && !identifiesPost(metaValue('og:url'), shortcode))
    throw new LibraryProviderError(
      'Instagram did not return this post. It may require sign-in, be private, or have been removed.',
      'blocked'
    )

  const caption = embedded ? nodes.find((node) => hasClass(node, 'Caption')) : undefined
  const username = embedded ? nodes.find((node) => hasClass(node, 'UsernameText')) : undefined
  const author = username
    ? readableText(username)
    : metaValue('og:title')?.match(/^(.*?) on Instagram:/)?.[1]
  const image = embedded
    ? nodes.find((node) => node.tagName === 'img' && hasClass(node, 'EmbeddedMediaImage'))
    : undefined
  const thumbnailUrl = image ? attribute(image, 'src') : metaValue('og:image')
  const description = caption ? readableText(caption) : metaValue('og:description')
  if (!thumbnailUrl && !description)
    throw new LibraryProviderError('Instagram returned no post text or thumbnail.', 'blocked')
  const title =
    description?.split('\n')[0].slice(0, 180) ||
    (author ? `Instagram post by ${author}` : `Instagram post ${shortcode}`)
  return {
    title,
    description,
    author,
    thumbnailUrl,
    fields: {
      title: {
        state: 'partial',
        reason: 'Display label from the written post; Instagram does not expose a separate title.'
      },
      description: caption
        ? { state: 'complete' }
        : description
          ? {
              state: 'partial',
              reason: 'Public page preview; the full written caption was not returned.'
            }
          : { state: 'unavailable', reason: 'The public embed returned no written caption.' },
      captions: {
        state: 'unavailable',
        reason:
          'The public Instagram post does not expose spoken caption tracks. Its written caption is saved separately; local transcription has not run.'
      }
    },
    provider: embedded ? 'instagram-embed/1' : 'instagram-page/1',
    fetchedAt: Date.now(),
    evidence: {
      shortcode,
      sourceUrl: embedded ? attribute(media!, 'href') : metaValue('og:url'),
      captionHtml: caption ? serializeOuter(caption) : undefined,
      pageTitle: metaValue('og:title'),
      pageDescription: metaValue('og:description'),
      author,
      thumbnailUrl
    }
  }
}
