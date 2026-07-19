---
'@xnetjs/data': minor
'@xnetjs/cli': minor
---

Add the publishing spine (exploration 0362).

`@xnetjs/data` gains a `Publication` schema and publishing fields on `Page`
(`publication`, `slug`, `excerpt`, `publishedAt`, `canonicalUrl`,
`publishedFrontier`). A post is a Page with editorial metadata rather than a
new document type, and `publishedAt` absence is what makes a post a draft.

`@xnetjs/cli` gains `xnet publish static`, which renders a publication to a
self-contained static site — HTML, RSS, sitemap and robots.txt — servable from
any static host with no hub in the read path.

Both changes are additive: no exports were removed or renamed, and every new
`Page` property is optional, so existing pages are unaffected.
