/**
 * Pure builders that turn the changelog data module into machine-readable
 * feeds. Shared by the JSON Feed and RSS Astro endpoints so both stay in sync,
 * and consumed by the in-app "What's New" surfaces via https://xnet.fyi/changelog.json.
 */

import type { ChangelogEntry } from '../data/changelog'

export const SITE_URL = 'https://xnet.fyi'
export const CHANGELOG_URL = `${SITE_URL}/changelog`

/** Absolute URL for an entry's anchor on the changelog page. */
export function entryUrl(entry: ChangelogEntry): string {
  return `${CHANGELOG_URL}#${entry.id}`
}

/** Resolve a hero src (absolute path or full URL) to an absolute URL. */
export function absoluteImage(src: string): string {
  return src.startsWith('http') ? src : `${SITE_URL}${src}`
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
      date_published: `${entry.id}T00:00:00Z`,
      tags: entry.tags,
      ...(entry.hero ? { image: absoluteImage(entry.hero.src) } : {}),
      // xNet extension: structured fields the in-app surfaces read directly.
      _xnet: {
        date: entry.date,
        summary: entry.summary,
        highlights: entry.highlights,
        ...(entry.pr ? { pr: entry.pr } : {})
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
    `      <pubDate>${new Date(`${entry.id}T00:00:00Z`).toUTCString()}</pubDate>`,
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
