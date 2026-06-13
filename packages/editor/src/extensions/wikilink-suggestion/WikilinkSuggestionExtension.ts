/**
 * `[[` wikilink typeahead (exploration 0170).
 *
 * Typing `[[` opens a suggestion popup over the workspace's linkable
 * nodes (pages, databases, canvases, dashboards, …). Picking inserts
 * the node's title as text carrying a `wikilink` mark whose href is
 * the node id (pages) or an `xnet://<type>/<id>` URI (everything
 * else) — the same target convention as Explorer drag-drop reference
 * chips (0166), so navigation and id-stable renames come for free.
 *
 * `[[query|alias` uses the alias as the link text (Obsidian-style).
 * A trailing create row creates a page on the fly via the host's
 * onCreateTarget and links to it. Manually typing the full
 * `[[title]]` still goes through the Wikilink mark's input rule.
 */
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { LinkTargetMenu, type WikilinkMenuItem } from '../../components/LinkTargetMenu'
import { createSuggestionPopupRender } from '../suggestion-popup'

const WikilinkSuggestionPluginKey = new PluginKey('wikilinkSuggestion')

/** Sentinel id for the trailing "create page" menu entry. */
export const CREATE_WIKILINK_ID = '__create-wikilink__'

export interface WikilinkTarget {
  /** wikilink mark href: page node id, or xnet://<type>/<id> */
  href: string
  /** Node title shown as the default link text */
  title: string
  /** Node kind shown in the menu ('page' | 'database' | …) */
  kind: string
}

export interface WikilinkSuggestionOptions {
  /** Linkable nodes, most-relevant first (hosts pre-sort by recency) */
  getTargets: () => WikilinkTarget[]
  /** Create a new page for an unmatched query; resolve null to abort */
  onCreateTarget?: (title: string) => Promise<WikilinkTarget | null>
}

export interface WikilinkQueryParts {
  search: string
  alias: string | null
}

/** Split a raw `[[` query on the first '|' (Obsidian alias syntax). */
export function parseWikilinkQuery(query: string): WikilinkQueryParts {
  const pipe = query.indexOf('|')
  if (pipe === -1) return { search: query.trim(), alias: null }
  return { search: query.slice(0, pipe).trim(), alias: query.slice(pipe + 1).trim() || null }
}

/** Prefix matches first, then substring matches, capped. */
export function matchWikilinkTargets(
  targets: WikilinkTarget[],
  search: string,
  cap = 8
): WikilinkTarget[] {
  if (!search) return targets.slice(0, cap)
  const q = search.toLowerCase()
  const starts = targets.filter((t) => t.title.toLowerCase().startsWith(q))
  const contains = targets.filter((t) => {
    const title = t.title.toLowerCase()
    return !title.startsWith(q) && title.includes(q)
  })
  return [...starts, ...contains].slice(0, cap)
}

function toMenuItem(target: WikilinkTarget, alias: string | null): WikilinkMenuItem {
  return { id: target.href, label: alias ?? target.title, kind: target.kind, subtitle: target.kind }
}

/** Menu items for a query: matches plus a create row for unknown titles. */
export function buildWikilinkMenuItems(
  targets: WikilinkTarget[],
  query: string,
  canCreate: boolean
): WikilinkMenuItem[] {
  const { search, alias } = parseWikilinkQuery(query)
  const items = matchWikilinkTargets(targets, search).map((target) => toMenuItem(target, alias))
  const exact = targets.some((t) => t.title.toLowerCase() === search.toLowerCase())
  if (canCreate && search && !exact) {
    items.push({
      id: CREATE_WIKILINK_ID,
      label: alias ?? search,
      kind: 'create',
      subtitle: 'Create page',
      createTitle: search
    })
  }
  return items
}

/** Extend the replace range over a manually typed ']]' right after it. */
export function endAfterClosingBrackets(
  doc: { textBetween: (from: number, to: number) => string; content: { size: number } },
  to: number
): number {
  const probe = Math.min(to + 2, doc.content.size)
  return doc.textBetween(to, probe) === ']]' ? probe : to
}

/** Inline content for a committed wikilink: marked text plus a space. */
export function wikilinkInsertContent(href: string, text: string): Array<Record<string, unknown>> {
  return [
    { type: 'text', text, marks: [{ type: 'wikilink', attrs: { href, title: text } }] },
    { type: 'text', text: ' ' }
  ]
}

export const WikilinkSuggestionExtension = Extension.create<WikilinkSuggestionOptions>({
  name: 'wikilinkSuggestion',

  addOptions() {
    return {
      getTargets: () => [],
      onCreateTarget: undefined
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<WikilinkMenuItem>({
        editor: this.editor,
        pluginKey: WikilinkSuggestionPluginKey,
        char: '[[',
        allowSpaces: true,
        startOfLine: false,
        items: ({ query }) =>
          buildWikilinkMenuItems(
            this.options.getTargets(),
            query,
            Boolean(this.options.onCreateTarget)
          ),
        command: ({ editor, range, props }) => {
          const to = endAfterClosingBrackets(editor.state.doc, range.to)

          if (props.id !== CREATE_WIKILINK_ID) {
            editor
              .chain()
              .focus()
              .insertContentAt(
                { from: range.from, to },
                wikilinkInsertContent(props.id, props.label)
              )
              .run()
            return
          }

          editor.chain().focus().deleteRange({ from: range.from, to }).run()
          void this.options.onCreateTarget?.(props.createTitle ?? props.label).then((target) => {
            if (!target) return
            editor
              .chain()
              .focus()
              .insertContent(wikilinkInsertContent(target.href, props.label || target.title))
              .run()
          })
        },
        render: createSuggestionPopupRender<WikilinkMenuItem>(LinkTargetMenu)
      })
    ]
  }
})
