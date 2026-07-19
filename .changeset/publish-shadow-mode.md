---
'@xnetjs/publish': minor
'@xnetjs/data': patch
---

Add shadow-publication support to `@xnetjs/publish` (exploration 0362).

`HeadOptions` gains `robots` and `feedAutodiscovery`, so a duplicate of a live
publication can be rendered `noindex, nofollow` with no RSS autodiscovery tag —
a staging copy that cannot be indexed, and that no reader can accidentally
subscribe to. A noindex publication also stops advertising a sitemap in its
`robots.txt`, which would otherwise be a mixed signal.

`@xnetjs/data` re-exports `PublicationSchema` from the package root, so a build
script can validate posts against the real schema.
