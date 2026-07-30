/**
 * `content-v4` → HTML (exploration 0362).
 *
 * The read side of publishing. Mirrors the tree walk in
 * `packages/plugins/src/ai-surface/page-fragment.ts` (blockGroup →
 * blockContainer → blockContent) but emits HTML instead of markdown, and adds
 * the two things a published page needs that a markdown projection does not:
 * a heading outline (for a table of contents) and an explicit degradation
 * policy for live embeds.
 *
 * Constraints, both load-bearing:
 * - **No DOM, no BlockNote.** Runs in plain Node so a static build or a hub
 *   route can render without a browser.
 * - **Deterministic.** The same fragment must produce byte-identical HTML on
 *   every run and platform, so builds are reproducible and diffable. Nothing
 *   here reads the clock, a random source, or locale-sensitive collation.
 */
import * as Y from 'yjs'
import { escapeAttr, escapeHtml, headingId, openTag, safeUrl } from './html'

/** The Y.XmlFragment field holding v4 (BlockNote) page documents. */
export const XNET_PAGE_FRAGMENT_FIELD = 'content-v4'
/** The legacy (TipTap, v3 and below) fragment, read as a fallback. */
export const XNET_PAGE_LEGACY_FRAGMENT_FIELD = 'content'

/**
 * How a live embed (database view, task view) degrades in static output.
 *
 * There is no honest "live" tier here: a published page is read outside the
 * app, so an embed is always a point-in-time artifact. Both tiers therefore
 * carry a visible snapshot date rather than silently implying freshness —
 * the Tier-2 honesty-label precedent from exploration 0344.
 */
export type EmbedTier = 'shell' | 'link'

export type RenderOptions = {
  /** How live embeds degrade. Defaults to `shell`. */
  embedTier?: EmbedTier
  /** Absolute site base, used to resolve wikilinks and embed fallback links. */
  baseUrl?: string
  /** Resolve a blob CID to a public URL. Defaults to `/blob/<cid>`. */
  resolveAsset?: (cid: string) => string
  /** Resolve a node id to a published URL, for wikilinks and page embeds. */
  resolveNode?: (nodeId: string) => string | undefined
  /**
   * Snapshot date shown on degraded embeds, as an ISO date (YYYY-MM-DD).
   * Required for a stamped embed; omitted renders the embed unstamped rather
   * than inventing a date, keeping the renderer clock-free and deterministic.
   */
  snapshotDate?: string
  /** Fragment field override. Defaults to `content-v4`. */
  field?: string
  /** Legacy fragment field read when the v4 fragment is empty. */
  legacyField?: string
}

export type RenderedHeading = { level: number; text: string; id: string }

export type RenderedPost = {
  /** The post body as an HTML fragment (no `<html>`/`<body>` wrapper). */
  html: string
  /** Plain-text excerpt, collapsed to a single line. */
  excerpt: string
  /** Heading outline, in document order, for a table of contents. */
  headings: RenderedHeading[]
  /** Blob CIDs referenced by the body — the publish step must copy these. */
  assets: string[]
}

type Attrs = Record<string, unknown>

const LIST_ITEM_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function attrString(attrs: Attrs, ...keys: string[]): string {
  for (const key of keys) {
    const value = attrs[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}

function elementChildren(node: Y.XmlElement | Y.XmlFragment): Y.XmlElement[] {
  const out: Y.XmlElement[] = []
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlElement) out.push(child)
  }
  return out
}

// ─── Rendering context ──────────────────────────────────────────────────────

type Ctx = {
  opts: Required<Pick<RenderOptions, 'embedTier'>> & RenderOptions
  headings: RenderedHeading[]
  assets: Set<string>
  text: string[]
  /** Heading anchors already used, so duplicate titles get -2, -3, … */
  usedIds: Map<string, number>
}

function uniqueHeadingId(ctx: Ctx, text: string): string {
  const base = headingId(text)
  const seen = ctx.usedIds.get(base) ?? 0
  ctx.usedIds.set(base, seen + 1)
  return seen === 0 ? base : `${base}-${seen + 1}`
}

// ─── Inline ─────────────────────────────────────────────────────────────────

/** Wrap text in mark elements. Order is fixed so output is deterministic. */
function markWrap(text: string, attributes: Attrs | undefined): string {
  if (!attributes || text === '') return text
  let out = text
  if (attributes.code) out = `<code>${out}</code>`
  if (attributes.bold) out = `<strong>${out}</strong>`
  if (attributes.italic) out = `<em>${out}</em>`
  if (attributes.strike) out = `<s>${out}</s>`
  if (attributes.underline) out = `<u>${out}</u>`
  const link = attributes.link
  const href = isRecord(link) ? link.href : link
  if (typeof href === 'string') {
    const safe = safeUrl(href)
    // A blocked scheme drops the anchor but keeps the text — never silently
    // discards authored content.
    if (safe) out = `<a href="${escapeAttr(safe)}" rel="noopener">${out}</a>`
  }
  return out
}

/** An inline atom carried as a delta embed (wikilink, mention). */
function inlineAtomToHtml(ctx: Ctx, embed: Record<string, unknown>): string {
  const type = typeof embed.type === 'string' ? embed.type : ''
  const attrs = isRecord(embed.attrs) ? (embed.attrs as Attrs) : (embed as Attrs)
  switch (type) {
    case 'wikilink': {
      const nodeId = attrString(attrs, 'nodeId', 'id')
      const label = attrString(attrs, 'title', 'label', 'text') || nodeId
      const href = nodeId ? ctx.opts.resolveNode?.(nodeId) : undefined
      ctx.text.push(label)
      // An unresolved wikilink points at an unpublished page: render the label
      // as plain text rather than a link into nowhere.
      return href
        ? `<a href="${escapeAttr(safeUrl(href))}" class="xn-wikilink">${escapeHtml(label)}</a>`
        : `<span class="xn-wikilink xn-wikilink--unresolved">${escapeHtml(label)}</span>`
    }
    case 'mention': {
      const label = attrString(attrs, 'name', 'handle', 'label')
      ctx.text.push(label)
      return `<span class="xn-mention">${escapeHtml(label)}</span>`
    }
    default: {
      const label = attrString(attrs, 'title', 'label', 'text')
      if (label) ctx.text.push(label)
      return label ? escapeHtml(label) : ''
    }
  }
}

function inlineToHtml(ctx: Ctx, node: Y.XmlElement): string {
  let out = ''
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      const delta = child.toDelta() as Array<{ insert?: unknown; attributes?: Attrs }>
      for (const op of delta) {
        if (typeof op.insert === 'string') {
          ctx.text.push(op.insert)
          out += markWrap(escapeHtml(op.insert), op.attributes)
        } else if (isRecord(op.insert)) {
          out += inlineAtomToHtml(ctx, op.insert)
        }
      }
    } else if (child instanceof Y.XmlElement) {
      // Inline atoms can also appear as elements rather than delta embeds.
      out += inlineAtomToHtml(ctx, {
        type: child.nodeName,
        attrs: child.getAttributes() as Attrs
      })
    }
  }
  return out
}

// ─── Embeds ─────────────────────────────────────────────────────────────────

function snapshotNote(ctx: Ctx, label: string): string {
  const date = ctx.opts.snapshotDate
  const text = date ? `${label} · snapshot as of ${date}` : label
  return `<p class="xn-embed__note">${escapeHtml(text)}</p>`
}

/**
 * Render a live embed (database view, task view) under the active tier.
 *
 * `shell` emits a titled container with the snapshot note; `link` emits only
 * an anchor back to the canonical node. Neither pretends to be live.
 */
function embedToHtml(ctx: Ctx, kind: string, attrs: Attrs): string {
  const nodeId = attrString(attrs, 'nodeId', 'databaseId', 'viewId', 'id')
  const title = attrString(attrs, 'title', 'name') || kind
  const href = nodeId ? ctx.opts.resolveNode?.(nodeId) : undefined
  ctx.text.push(title)

  if (ctx.opts.embedTier === 'link') {
    return href
      ? `<p class="xn-embed xn-embed--link"><a href="${escapeAttr(safeUrl(href))}">${escapeHtml(title)}</a></p>`
      : `<p class="xn-embed xn-embed--link">${escapeHtml(title)}</p>`
  }

  const link = href
    ? `<p class="xn-embed__link"><a href="${escapeAttr(safeUrl(href))}">Open ${escapeHtml(title)}</a></p>`
    : ''
  return [
    `<figure class="xn-embed xn-embed--shell" data-embed="${escapeAttr(kind)}">`,
    `<figcaption class="xn-embed__title">${escapeHtml(title)}</figcaption>`,
    link,
    snapshotNote(ctx, 'Live view — not interactive here'),
    '</figure>'
  ]
    .filter(Boolean)
    .join('')
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

function tableToHtml(ctx: Ctx, table: Y.XmlElement): string {
  const rows: string[][] = []
  const visit = (element: Y.XmlElement): void => {
    for (const child of elementChildren(element)) {
      if (child.nodeName === 'tableRow') {
        const cells: string[] = []
        for (const cell of elementChildren(child)) {
          if (cell.nodeName === 'tableCell' || cell.nodeName === 'tableHeader') {
            cells.push(inlineToHtml(ctx, cell))
          }
        }
        rows.push(cells)
      } else {
        visit(child)
      }
    }
  }
  visit(table)
  if (rows.length === 0) return ''

  const head = `<thead><tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr></thead>`
  const body = rows
    .slice(1)
    .map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')
  // Wrapped so wide tables scroll inside their own box rather than forcing the
  // whole page to scroll horizontally.
  return `<div class="xn-table-wrap"><table>${head}${body ? `<tbody>${body}</tbody>` : ''}</table></div>`
}

function imageToHtml(ctx: Ctx, attrs: Attrs): string {
  const cid = attrString(attrs, 'cid')
  const rawSrc = attrString(attrs, 'src', 'url')
  if (cid) ctx.assets.add(cid)
  const src = cid ? (ctx.opts.resolveAsset?.(cid) ?? `/blob/${cid}`) : rawSrc
  const safe = safeUrl(src)
  if (!safe) return ''
  const alt = attrString(attrs, 'alt', 'caption')
  const caption = attrString(attrs, 'caption')
  if (alt) ctx.text.push(alt)
  const img = openTag('img', { src: safe, alt, loading: 'lazy', decoding: 'async' })
  return caption
    ? `<figure>${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
    : `<p class="xn-image">${img}</p>`
}

/** One blockContent element → HTML. `nested` is already-rendered child HTML. */
function blockContentToHtml(ctx: Ctx, content: Y.XmlElement, nested: string): string {
  const attrs = content.getAttributes() as Attrs
  const name = content.nodeName

  switch (name) {
    case 'paragraph': {
      const inner = inlineToHtml(ctx, content)
      ctx.text.push('\n')
      return inner ? `<p>${inner}</p>${nested}` : nested
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(attrs.level ?? 1) || 1, 1), 6)
      const before = ctx.text.length
      const inner = inlineToHtml(ctx, content)
      const plain = ctx.text.slice(before).join('').trim()
      const id = uniqueHeadingId(ctx, plain)
      ctx.headings.push({ level, text: plain, id })
      ctx.text.push('\n')
      return `<h${level} id="${escapeAttr(id)}">${inner}</h${level}>${nested}`
    }
    case 'bulletListItem':
    case 'numberedListItem': {
      ctx.text.push('\n')
      return `<li>${inlineToHtml(ctx, content)}${nested}</li>`
    }
    case 'checkListItem': {
      const checked = attrs.checked === true || attrs.checked === 'true'
      ctx.text.push('\n')
      const box = `<input type="checkbox" disabled${checked ? ' checked' : ''} />`
      return `<li class="xn-task">${box} ${inlineToHtml(ctx, content)}${nested}</li>`
    }
    case 'codeBlock': {
      const language = attrString(attrs, 'language')
      const before = ctx.text.length
      inlineToHtml(ctx, content)
      const code = escapeHtml(ctx.text.slice(before).join(''))
      ctx.text.push('\n')
      const cls = language ? ` class="language-${escapeAttr(language)}"` : ''
      return `<pre><code${cls}>${code}</code></pre>${nested}`
    }
    case 'quote': {
      ctx.text.push('\n')
      return `<blockquote><p>${inlineToHtml(ctx, content)}</p>${nested}</blockquote>`
    }
    case 'callout': {
      const kind = attrString(attrs, 'kind') || 'info'
      ctx.text.push('\n')
      return `<aside class="xn-callout xn-callout--${escapeAttr(kind)}"><p>${inlineToHtml(ctx, content)}</p>${nested}</aside>`
    }
    case 'table':
      return tableToHtml(ctx, content) + nested
    case 'image':
      return imageToHtml(ctx, attrs) + nested
    case 'mermaid': {
      const code = attrString(attrs, 'code') || ''
      return `<pre class="mermaid">${escapeHtml(code)}</pre>${nested}`
    }
    case 'divider':
    case 'horizontalRule':
      return `<hr />${nested}`
    case 'embed':
    case 'richLink': {
      const url = safeUrl(attrString(attrs, 'url'))
      if (!url) return nested
      const label = attrString(attrs, 'title') || url
      ctx.text.push(label)
      return `<p class="xn-richlink"><a href="${escapeAttr(url)}" rel="noopener">${escapeHtml(label)}</a></p>${nested}`
    }
    case 'pageEmbed': {
      const nodeId = attrString(attrs, 'nodeId', 'id')
      const label = attrString(attrs, 'title') || nodeId
      const href = nodeId ? ctx.opts.resolveNode?.(nodeId) : undefined
      ctx.text.push(label)
      return href
        ? `<p class="xn-pageembed"><a href="${escapeAttr(safeUrl(href))}">${escapeHtml(label)}</a></p>${nested}`
        : `<p class="xn-pageembed">${escapeHtml(label)}</p>${nested}`
    }
    // Custom xNet specs (packages/editor/src/blocknote/specs/).
    case 'databaseEmbed':
    case 'database-embed':
      return embedToHtml(ctx, 'database', attrs) + nested
    case 'taskViewEmbed':
    case 'task-view-embed':
      return embedToHtml(ctx, 'tasks', attrs) + nested
    case 'aiGenerated':
    case 'ai-generated': {
      // Provenance is content, not chrome: an AI-written block stays labelled
      // in published output (exploration 0234's provenance badge).
      const inner = inlineToHtml(ctx, content)
      ctx.text.push('\n')
      return `<div class="xn-ai-generated" data-provenance="ai">${inner ? `<p>${inner}</p>` : ''}${nested}</div>`
    }
    default: {
      // Unknown block: degrade to its inline text rather than dropping it.
      const inner = inlineToHtml(ctx, content)
      ctx.text.push('\n')
      return inner ? `<p>${inner}</p>${nested}` : nested
    }
  }
}

function blockGroupToHtml(ctx: Ctx, group: Y.XmlElement | Y.XmlFragment): string {
  let out = ''
  // Buffer consecutive list items so they share one <ul>/<ol>.
  let listTag: 'ul' | 'ol' | null = null
  let listItems: string[] = []

  const flush = (): void => {
    if (listTag && listItems.length > 0) out += `<${listTag}>${listItems.join('')}</${listTag}>`
    listTag = null
    listItems = []
  }

  for (const container of elementChildren(group)) {
    if (container.nodeName !== 'blockContainer') {
      // Tolerate schema drift: recurse through unexpected wrappers.
      flush()
      out += blockGroupToHtml(ctx, container)
      continue
    }

    const children = elementChildren(container)
    const content = children.find((child) => child.nodeName !== 'blockGroup') ?? null
    const childGroup = children.find((child) => child.nodeName === 'blockGroup') ?? null
    const type = content?.nodeName ?? ''
    const nested = childGroup ? blockGroupToHtml(ctx, childGroup) : ''

    if (!content) {
      if (nested) {
        flush()
        out += nested
      }
      continue
    }

    const html = blockContentToHtml(ctx, content, nested)
    if (LIST_ITEM_TYPES.has(type)) {
      const wanted = type === 'numberedListItem' ? 'ol' : 'ul'
      if (listTag !== wanted) flush()
      listTag = wanted
      listItems.push(html)
    } else {
      flush()
      out += html
    }
  }

  flush()
  return out
}

// ─── Entry point ────────────────────────────────────────────────────────────

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Build a plain-text excerpt of at most `max` characters, cut on a word. */
export function buildExcerpt(text: string, max = 200): string {
  const flat = collapse(text)
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * Render a page document to HTML.
 *
 * Reads the v4 fragment, falling back to the legacy TipTap fragment when v4 is
 * empty, so pages written before the 0312 migration still publish.
 */
export function renderPost(doc: Y.Doc, options: RenderOptions = {}): RenderedPost {
  const field = options.field ?? XNET_PAGE_FRAGMENT_FIELD
  const legacyField = options.legacyField ?? XNET_PAGE_LEGACY_FRAGMENT_FIELD

  let fragment = doc.getXmlFragment(field)
  if (fragment.length === 0 && legacyField) {
    const legacy = doc.getXmlFragment(legacyField)
    if (legacy.length > 0) fragment = legacy
  }

  const ctx: Ctx = {
    opts: { embedTier: options.embedTier ?? 'shell', ...options },
    headings: [],
    assets: new Set<string>(),
    text: [],
    usedIds: new Map<string, number>()
  }

  const html = blockGroupToHtml(ctx, fragment)

  return {
    html,
    excerpt: buildExcerpt(ctx.text.join('')),
    headings: ctx.headings,
    // Sorted so the asset list is stable regardless of traversal incidentals.
    assets: [...ctx.assets].sort()
  }
}
