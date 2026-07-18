const SITE_URL = "https://xnet.fyi";
const CHANGELOG_URL = `${SITE_URL}/changelog`;
function entryUrl(entry) {
  return `${CHANGELOG_URL}#${entry.id}`;
}
function absoluteImage(src) {
  return src.startsWith("http") ? src : `${SITE_URL}${src}`;
}
function entryInstant(entry) {
  return entry.mergedAt ?? `${entry.id.slice(0, 10)}T00:00:00Z`;
}
function contentText(entry) {
  return [entry.summary, "", ...entry.highlights.map((h) => `• ${h}`)].join("\n");
}
function buildJsonFeed(entries) {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: "xNet Changelog",
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
      ...entry.hero ? { image: absoluteImage(entry.hero.src) } : {},
      // xNet extension: structured fields the in-app surfaces read directly.
      _xnet: {
        date: entry.date,
        summary: entry.summary,
        highlights: entry.highlights,
        ...entry.mergedAt ? { mergedAt: entry.mergedAt } : {},
        ...entry.pr ? { pr: entry.pr } : {},
        ...(() => {
          const authors = entry.authors?.length ? entry.authors : entry.author ? [entry.author] : [];
          return authors.length ? { authors } : {};
        })(),
        ...entry.author ? { author: entry.author } : {},
        ...entry.images?.length ? { images: entry.images.map((img) => ({ ...img, src: absoluteImage(img.src) })) } : {},
        ...entry.video ? {
          video: {
            ...entry.video,
            src: absoluteImage(entry.video.src),
            poster: absoluteImage(entry.video.poster)
          }
        } : {}
      }
    }))
  };
}
function xmlEscape(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function rssItem(entry) {
  const description = [entry.summary, ...entry.highlights.map((h) => `- ${h}`)].join("\n");
  return [
    "    <item>",
    `      <title>${xmlEscape(entry.title)}</title>`,
    `      <link>${xmlEscape(entryUrl(entry))}</link>`,
    `      <guid isPermaLink="false">${xmlEscape(entry.id)}</guid>`,
    `      <pubDate>${new Date(entryInstant(entry)).toUTCString()}</pubDate>`,
    `      <description>${xmlEscape(description)}</description>`,
    "    </item>"
  ].join("\n");
}
function buildRssXml(entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>xNet Changelog</title>",
    `    <link>${CHANGELOG_URL}</link>`,
    "    <description>What's new in xNet.</description>",
    "    <language>en</language>",
    ...entries.map(rssItem),
    "  </channel>",
    "</rss>"
  ].join("\n");
}

export { buildRssXml as a, buildJsonFeed as b };
