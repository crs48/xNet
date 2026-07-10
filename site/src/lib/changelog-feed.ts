/**
 * Pure builders that turn the changelog data module into machine-readable
 * feeds. Shared by the JSON Feed and RSS Astro endpoints so both stay in sync,
 * and consumed by the in-app "What's New" surfaces via https://xnet.fyi/changelog.json.
 */

import type { ChangelogEntry } from '../data/changelog'

const SITE_URL = 'https://xnet.fyi'
const CHANGELOG_URL = `${SITE_URL}/changelog`

/** Absolute URL for an entry's anchor on the changelog page. */
function entryUrl(entry: ChangelogEntry): string {
  return `${CHANGELOG_URL}#${entry.id}`
}

/** Resolve a hero src (absolute path or full URL) to an absolute URL. */
function absoluteImage(src: string): string {
  return src.startsWith('http') ? src : `${SITE_URL}${src}`
}

/**
 * The instant a feed entry is timestamped at: the PR's real merge time
 * (`mergedAt`, time-of-day precision) when known, else midnight UTC of the `id`
 * date prefix. Slicing to the 10-char date prefix is also what keeps the
 * fallback well-formed for a slugged id — `2026-06-24-foo` →
 * `2026-06-24T00:00:00Z`, not the malformed `2026-06-24-fooT00:00:00Z`.
 */
function entryInstant(entry: ChangelogEntry): string {
  return entry.mergedAt ?? `${entry.id.slice(0, 10)}T00:00:00Z`
}

function contentText(entry: ChangelogEntry): string {
  return [entry.summary, '', ...entry.highlights.map((h) => `• ${h}`)].join('\n')
}

/** JSON Feed 1.1 — https://jsonfeed.org/version/1.1 */
export function buildJsonFeed(entries: ChangelogEntry[]): object {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'xNet Changelog',
    home_page_url: CHANGELOG_URL,
    feed_url: `${SITE_URL}/changelog.json`,
    description: "What's new in xNet.",
    items: entries.map((entry) => ({
      id: entry.id,
      url: entryUrl(entry),
      title: entry.title,
      content_text: contentText(entry),
      date_published: entryInstant(entry),
      tags: entry.tags,
      ...(entry.hero ? { image: absoluteImage(entry.hero.src) } : {}),
      // xNet extension: structured fields the in-app surfaces read directly.
      _xnet: {
        date: entry.date,
        summary: entry.summary,
        highlights: entry.highlights,
        ...(entry.mergedAt ? { mergedAt: entry.mergedAt } : {}),
        ...(entry.pr ? { pr: entry.pr } : {}),
        ...(() => {
          // Everyone who contributed; fall back to the legacy single author.
          const authors = entry.authors?.length
            ? entry.authors
            : entry.author
              ? [entry.author]
              : []
          return authors.length ? { authors } : {}
        })(),
        ...(entry.author ? { author: entry.author } : {}),
        ...(entry.images?.length
          ? { images: entry.images.map((img) => ({ ...img, src: absoluteImage(img.src) })) }
          : {}),
        ...(entry.video
          ? {
              video: {
                ...entry.video,
                src: absoluteImage(entry.video.src),
                poster: absoluteImage(entry.video.poster)
              }
            }
          : {})
      }
    }))
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function rssItem(entry: ChangelogEntry): string {
  const description = [entry.summary, ...entry.highlights.map((h) => `- ${h}`)].join('\n')
  return [
    '    <item>',
    `      <title>${xmlEscape(entry.title)}</title>`,
    `      <link>${xmlEscape(entryUrl(entry))}</link>`,
    `      <guid isPermaLink="false">${xmlEscape(entry.id)}</guid>`,
    `      <pubDate>${new Date(entryInstant(entry)).toUTCString()}</pubDate>`,
    `      <description>${xmlEscape(description)}</description>`,
    '    </item>'
  ].join('\n')
}

/** RSS 2.0 feed (hand-rolled, zero dependencies). */
export function buildRssXml(entries: ChangelogEntry[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>xNet Changelog</title>',
    `    <link>${CHANGELOG_URL}</link>`,
    "    <description>What's new in xNet.</description>",
    '    <language>en</language>',
    ...entries.map(rssItem),
    '  </channel>',
    '</rss>'
  ].join('\n')
}
