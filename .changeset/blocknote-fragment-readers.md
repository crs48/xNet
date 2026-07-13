---
'@xnetjs/data': minor
'@xnetjs/history': minor
'@xnetjs/react': minor
'@xnetjs/runtime': patch
---

Yjs fragment readers understand the BlockNote document schema (exploration 0312).

Documents now live in the `content-v4` fragment using BlockNote's ProseMirror
shape (`blockGroup > blockContainer > blockContent`); the legacy TipTap
`content` fragment remains readable as a fallback until each doc is lazily
imported.

- `@xnetjs/data`: `getRichTextPlainText` extracts text from BlockNote-shaped
  rich-text cells, including the new inline atoms (`mention` → `@label`,
  `hashtag` → `#name`, `wikilink` → title, `inlineMath` → latex), while still
  reading legacy TipTap-shaped cells.
- `@xnetjs/history`: version-diff text extraction prefers `content-v4` (legacy
  `content` fallback) and renders BlockNote inline atoms as readable text.
- `@xnetjs/react`: new `useMergedEditorContributions` /
  `mergeEditorContributions` (+ `MergedEditorContributions` type) collect
  plugin-contributed BlockNote `blockSpecs`/`inlineContentSpecs`/`styleSpecs`
  and slash menu items from the plugin registry, running the editor
  schema-skew guard (`warnOnEditorSchemaRisks`) against the host's statically
  bundled spec names and excluding un-bundled (skew-hazard) specs.
- `@xnetjs/runtime`: blob-CID retention scanning now also walks the
  `content-v4` and `content` fragments, so blobs referenced from page
  documents are discovered.
