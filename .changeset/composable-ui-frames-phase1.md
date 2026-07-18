---
'@xnetjs/editor': minor
---

Live embeds in documents (exploration 0346, Phase 1): `databaseEmbed` blocks
now pass any registry view type through to the host (map, timeline, plugin
views — not just the built-in six), `pageEmbed` blocks render a host-provided
live summary transclusion via the new `renderPageEmbed` host callback, and the
slash menu gains a `/view of…` command backed by the new
`onSelectDatabaseView` host picker. Adds `extractDocPreviewLines` for
summary-tier text extraction from a v4 document fragment.
