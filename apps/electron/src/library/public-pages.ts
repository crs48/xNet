import type { CaptionTrack, LibraryMetadata } from './types'
import type { DefaultTreeAdapterTypes } from 'parse5'
import { parse } from 'parse5'
import { LibraryProviderError } from './provider-error'

type Element = DefaultTreeAdapterTypes.Element
type Node = DefaultTreeAdapterTypes.Node
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const attr = (node: Element, key: string) => node.attrs.find((a) => a.name === key)?.value
function elements(html: string): Element[] {
  const pending: Node[] = [parse(html)],
    result: Element[] = []
  while (pending.length) {
    const node = pending.pop()!
    if ('tagName' in node) result.push(node)
    if ('childNodes' in node)
      for (let i = node.childNodes.length - 1; i >= 0; i--) pending.push(node.childNodes[i])
  }
  return result
}
function content(root: Node): string {
  const pending: Node[] = [root],
    result: string[] = []
  while (pending.length) {
    const node = pending.pop()!
    if ('tagName' in node && ['script', 'style', 'template'].includes(node.tagName)) continue
    if ('value' in node && node.nodeName === '#text') result.push(node.value)
    if ('tagName' in node && ['p', 'br', 'div', 'li', 'h1', 'h2', 'h3'].includes(node.tagName))
      result.push('\n')
    if ('childNodes' in node)
      for (let i = node.childNodes.length - 1; i >= 0; i--) pending.push(node.childNodes[i])
  }
  return result
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim()
}
function scriptText(node: Element): string {
  return node.childNodes
    .map((child) => (child.nodeName === '#text' && 'value' in child ? child.value : ''))
    .join('')
}

/** Read only the public repository fields, never the page's tokens or viewer state. */
function githubOverview(nodes: Element[]) {
  const script = nodes.find(
    (node) => node.tagName === 'script' && attr(node, 'data-target') === 'react-app.embeddedData'
  )
  if (!script) return undefined
  const value: unknown = JSON.parse(scriptText(script))
  const payload = record(value) && record(value.payload) ? value.payload : undefined
  if (!payload) return undefined
  const route = record(payload.codeViewRepoRoute) ? payload.codeViewRepoRoute : {}
  const overview = record(route.overview) ? route.overview : {}
  const files = Array.isArray(overview.overviewFiles) ? overview.overviewFiles : []
  const readme = files.find((file: unknown) => record(file) && file.preferredFileType === 'readme')
  const about = record(payload.sidebarAbout) ? payload.sidebarAbout : {}
  const repo = record(about.repo) ? about.repo : {}
  const license = record(repo.license) ? repo.license : {}
  return {
    description: text(about.description),
    website: text(about.website),
    topics: Array.isArray(about.topics)
      ? about.topics.flatMap((topic: unknown) => {
          const name =
            typeof topic === 'string' ? topic : record(topic) ? text(topic.name) : undefined
          return name ? [name] : []
        })
      : [],
    stars: typeof about.stargazerCount === 'number' ? about.stargazerCount : undefined,
    forks: typeof about.forksCount === 'number' ? about.forksCount : undefined,
    license: text(license.spdxId) ?? text(license.name),
    readmePath: record(readme) ? text(readme.path) : undefined,
    readmeHtml: record(readme) ? text(readme.richText) : undefined
  }
}
const labelCoverage = {
  state: 'partial' as const,
  reason: 'Display label derived from the written post, not a separate authored title.'
}

export function parseTikTokPage(html: string, videoId: string): LibraryMetadata {
  const script = elements(html).find(
    (node) => attr(node, 'id') === '__UNIVERSAL_DATA_FOR_REHYDRATION__'
  )
  if (!script) throw new LibraryProviderError('TikTok did not return public post data.', 'blocked')
  const data: unknown = JSON.parse(scriptText(script))
  const scope = record(data) && data.__DEFAULT_SCOPE__
  const detail = record(scope) && scope['webapp.video-detail']
  const info = record(detail) && detail.itemInfo
  const item = record(info) && info.itemStruct
  if (!record(item) || item.id !== videoId)
    throw new LibraryProviderError(
      'TikTok did not return this post; it may be private or removed.',
      'blocked'
    )
  const video = record(item.video) ? item.video : {}
  const author = record(item.author) ? item.author : {}
  const cla = record(video.claInfo) ? video.claInfo : {}
  const tracks: CaptionTrack[] = []
  let unsupportedTracks = false
  for (const [items, modern] of [
    [cla.captionInfos, true],
    [video.subtitleInfos, false]
  ] as const) {
    if (items !== undefined && !Array.isArray(items))
      throw new LibraryProviderError('TikTok caption inventory is malformed.', 'retry')
    for (const entry of Array.isArray(items) ? items : []) {
      if (!record(entry))
        throw new LibraryProviderError('TikTok caption entry is malformed.', 'retry')
      const url = text(modern ? entry.url : entry.Url)
      const format = text(modern ? entry.captionFormat : entry.Format)
      const language = text(
        modern ? (entry.languageCode ?? entry.language) : entry.LanguageCodeName
      )
      if (!url || !language || !format)
        throw new LibraryProviderError('TikTok caption entry is incomplete.', 'retry')
      if (!['webvtt', 'vtt'].includes(format)) {
        unsupportedTracks = true
        continue
      }
      if (tracks.some((track) => track.url === url)) continue
      tracks.push({
        url,
        language: language.replace(/^eng(?=-|$)/, 'en'),
        format: 'vtt',
        autoGenerated: modern ? entry.isAutoGen === true : entry.Source === 'ASR'
      })
    }
  }
  const description = text(item.desc)
  const thumbnailUrl = text(video.originCover) ?? text(video.cover)
  if (!description && !thumbnailUrl)
    throw new LibraryProviderError('TikTok returned no caption or poster.', 'blocked')
  const imagePost = record(item.imagePost)
  return {
    title:
      description?.split('\n')[0].slice(0, 180) ||
      `TikTok post by ${text(author.uniqueId) ?? videoId}`,
    description,
    thumbnailUrl,
    author: text(author.uniqueId) ?? text(author.nickname),
    ...(typeof video.duration === 'number' ? { durationSeconds: video.duration } : {}),
    language: text(item.textLanguage),
    tracks,
    fields: {
      title: labelCoverage,
      description:
        description !== undefined
          ? { state: 'complete' }
          : { state: 'unavailable', reason: 'TikTok returned no written caption.' },
      captions: unsupportedTracks
        ? { state: 'partial', reason: 'Some TikTok subtitle formats are not supported.' }
        : tracks.length ||
            imagePost ||
            Array.isArray(video.subtitleInfos) ||
            Array.isArray(cla.captionInfos)
          ? { state: 'complete' }
          : { state: 'unavailable', reason: 'TikTok did not report spoken caption availability.' }
    },
    provider: 'tiktok-page/1',
    fetchedAt: Date.now(),
    evidence: {
      id: item.id,
      desc: description,
      author: text(author.uniqueId),
      createTime: item.createTime,
      thumbnailUrl,
      tracks,
      imagePost
    }
  }
}

export function parsePublicPage(html: string, url: string, github = false): LibraryMetadata {
  const nodes = elements(html)
  const repository = github ? githubOverview(nodes) : undefined
  const meta = (key: string) => {
    const node = nodes.find(
      (n) => n.tagName === 'meta' && (attr(n, 'property') === key || attr(n, 'name') === key)
    )
    return node ? attr(node, 'content') : undefined
  }
  const titleNode = nodes.find((n) => n.tagName === 'title')
  const title = meta('og:title') ?? (titleNode ? content(titleNode) : undefined)
  const preview = repository?.description ?? meta('og:description') ?? meta('description')
  const readme = github
    ? nodes.find(
        (n) =>
          n.tagName === 'article' && (attr(n, 'class') ?? '').split(/\s+/).includes('markdown-body')
      )
    : undefined
  const readmeText = repository?.readmeHtml
    ? content(parse(repository.readmeHtml))
    : readme
      ? content(readme)
      : undefined
  const article = !github ? nodes.find((node) => node.tagName === 'article') : undefined
  const articleText = article ? content(article) : undefined
  const topics = repository?.topics.length ? `Topics: ${repository.topics.join(', ')}` : undefined
  const description =
    [preview, readmeText ?? articleText, topics].filter(Boolean).join('\n\n') || undefined
  const image = meta('og:image') ?? meta('twitter:image')
  const tracks = nodes
    .filter(
      (n) => n.tagName === 'track' && ['captions', 'subtitles'].includes(attr(n, 'kind') ?? '')
    )
    .flatMap((node): CaptionTrack[] => {
      const src = attr(node, 'src')
      if (!src) return []
      return [
        {
          url: new URL(src, url).href,
          format: 'vtt',
          language: attr(node, 'srclang') ?? 'und',
          autoGenerated: false
        }
      ]
    })
  if (!title && !description && !image)
    throw new LibraryProviderError('Page returned no usable metadata.', 'unavailable')
  return {
    title,
    description,
    thumbnailUrl: image ? new URL(image, url).href : undefined,
    author: meta('author') ?? (github ? new URL(url).pathname.split('/')[1] : undefined),
    tracks,
    fields: {
      title: title ? { state: 'complete' } : { state: 'unavailable', reason: 'Page has no title.' },
      description: description
        ? github && readmeText
          ? { state: 'complete' }
          : {
              state: 'partial',
              reason: articleText
                ? 'Visible article text; the source may omit content from its public page.'
                : github
                  ? 'Repository description; no rendered README was returned.'
                  : 'Page preview; full article text has not been extracted.'
            }
        : { state: 'unavailable', reason: 'Page has no description.' },
      ...(github
        ? {
            readme: readmeText
              ? { state: 'complete' as const }
              : { state: 'unavailable' as const, reason: 'No rendered README found.' }
          }
        : {}),
      ...(tracks.length ? { captions: { state: 'complete' as const } } : {})
    },
    provider: github ? 'github-page/2' : 'public-page/2',
    fetchedAt: Date.now(),
    evidence: {
      url,
      title,
      preview,
      readme: readmeText,
      article: articleText,
      image,
      tracks,
      ...(repository
        ? {
            repository: {
              website: repository.website,
              topics: repository.topics,
              stars: repository.stars,
              forks: repository.forks,
              license: repository.license,
              readmePath: repository.readmePath
            }
          }
        : {})
    }
  }
}

export function parsePostPreview(value: unknown, platform: 'reddit' | 'tiktok'): LibraryMetadata {
  if (!record(value) || (!text(value.title) && !text(value.thumbnail_url)))
    throw new LibraryProviderError(`${platform} returned no public post preview.`, 'blocked')
  const description = text(value.title)
  return {
    title: description?.slice(0, 180),
    description,
    author: text(value.author_name),
    thumbnailUrl: text(value.thumbnail_url),
    fields: {
      title: labelCoverage,
      description: {
        state: 'partial',
        reason: 'Public embed preview; full post text was not returned.'
      },
      captions: {
        state: 'unavailable',
        reason: 'The public preview does not expose spoken caption tracks.'
      }
    },
    provider: `${platform}-oembed/1`,
    fetchedAt: Date.now(),
    evidence: value
  }
}
