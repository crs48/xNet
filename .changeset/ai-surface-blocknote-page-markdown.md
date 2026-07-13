---
'@xnetjs/plugins': major
---

AI page-markdown surface re-targeted to the BlockNote editor (exploration 0312).

- **Breaking**: the page-markdown apply adapter mode `'tiptap-yjs'` is renamed
  to `'blocknote-yjs'` in `AiPageMarkdownApplyAdapterResult['mode']` and
  `AiPageMarkdownApplyResult['mode']`. Adapters that returned
  `mode: 'tiptap-yjs'` must return `'blocknote-yjs'` (or `'yjs'`/`'custom'`).
- New Yjs-fragment ↔ markdown conversion for BlockNote (`content-v4`)
  documents, dependency-light (walks the Yjs XML tree directly, no editor/DOM):
  - `xnetPageFragmentToMarkdown(doc)` reads the BlockNote fragment
    (paragraph/heading/lists/check items/code/quote/callout/table + inline
    `mention`/`hashtag`/`wikilink`/`inlineMath` atoms), falling back to the
    legacy TipTap `content` fragment when `content-v4` is empty
    (`blockNoteFragmentToMarkdown` / `legacyFragmentToMarkdown` are also
    exported).
  - `replaceXNetPageFragmentWithMarkdown(doc, markdown)` writes the AI
    markdown subset (paragraphs, headings, bullet/numbered/check lists with
    nesting, fenced code, quotes, callouts, wikilinks) as BlockNote PM XML —
    `blockGroup > blockContainer` (unique `id` per block) wrappers — in one
    Yjs transaction.
  - `createBlockNotePageMarkdownAdapter({ resolveDoc })` packages both as an
    `AiPageMarkdownApplyAdapter` (plus `readMarkdown`) for
    `xnet_apply_page_markdown`, replacing the TipTap-era document bridge.
  - `XNET_PAGE_FRAGMENT_FIELD` (`'content-v4'`) and
    `XNET_PAGE_LEGACY_FRAGMENT_FIELD` (`'content'`) constants.
- `@xnetjs/plugins` now depends on `yjs`; the unused `@tiptap/core`
  devDependency is gone.
