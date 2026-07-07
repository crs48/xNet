/**
 * AiGeneratedMark — a TipTap mark that labels AI-authored text in the editor
 * (xNet Humane Internet Charter §Agency, exploration 0234).
 *
 * When the assistant inserts or rewrites text, that span is marked
 * `ai-generated` (the trust tier from `@xnetjs/trust`) so the provenance is
 * always legible — a subtle underline + a hover tooltip naming the assist mode
 * and any sources the model cited. Anything the model authored discloses itself.
 */
import { Mark, mergeAttributes } from '@tiptap/core'

/** How the assistant produced the text (mirrors AiAssistMode in @xnetjs/plugins). */
export type AiProvenanceMode = 'scaffold' | 'draft'

/** A cited source the AI drew on (from the GraphRAG retriever). */
export interface AiCitation {
  nodeId: string
  title: string
}

export interface AiGeneratedMarkOptions {
  HTMLAttributes: Record<string, string>
}

export interface AiGeneratedAttrs {
  assistMode: AiProvenanceMode
  citations: AiCitation[] | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiGenerated: {
      /** Mark the current selection as AI-generated. */
      setAiGenerated: (attrs?: Partial<AiGeneratedAttrs>) => ReturnType
      /** Mark an explicit range as AI-generated (used right after an AI insert). */
      setAiGeneratedRange: (
        from: number,
        to: number,
        attrs?: Partial<AiGeneratedAttrs>
      ) => ReturnType
      /** Remove the AI-generated mark from the selection. */
      unsetAiGenerated: () => ReturnType
      /**
       * Delete every AI-generated span in the document, leaving user-authored
       * text untouched — the "regenerate" primitive (exploration 0279): drop
       * the old AI output, then insert the fresh one marked again.
       */
      deleteAiGeneratedRanges: () => ReturnType
    }
  }
}

/** Human-readable tooltip: provenance + cited sources. */
export function aiGeneratedTitle(attrs: AiGeneratedAttrs): string {
  const head = `AI-generated · ${attrs.assistMode}`
  const cites = attrs.citations ?? []
  if (cites.length === 0) return head
  return `${head} · Sources: ${cites.map((c) => c.title).join(', ')}`
}

/**
 * All ranges in `doc` carrying the aiGenerated mark, merged when adjacent.
 * Exposed for callers that need to inspect (not delete) AI spans — e.g. the
 * meeting recorder deciding whether a regenerate has anything to replace.
 */
export function aiGeneratedRanges(doc: {
  descendants: (cb: (node: unknown, pos: number) => void) => void
}): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  doc.descendants((node, pos) => {
    const n = node as {
      isText?: boolean
      nodeSize: number
      marks: Array<{ type: { name: string } }>
    }
    if (!n.isText) return
    if (!n.marks.some((mark) => mark.type.name === 'aiGenerated')) return
    const from = pos
    const to = pos + n.nodeSize
    const last = ranges[ranges.length - 1]
    if (last && last.to === from) last.to = to
    else ranges.push({ from, to })
  })
  return ranges
}

function parseCitations(value: string | null): AiCitation[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as AiCitation[]) : null
  } catch {
    return null
  }
}

export const AiGeneratedMark = Mark.create<AiGeneratedMarkOptions>({
  name: 'aiGenerated',
  inclusive: false,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      assistMode: {
        default: 'scaffold' as AiProvenanceMode,
        parseHTML: (el) => (el.getAttribute('data-assist-mode') as AiProvenanceMode) || 'scaffold',
        renderHTML: (attrs) => ({ 'data-assist-mode': attrs.assistMode })
      },
      citations: {
        default: null as AiCitation[] | null,
        parseHTML: (el) => parseCitations(el.getAttribute('data-citations')),
        renderHTML: (attrs) =>
          attrs.citations ? { 'data-citations': JSON.stringify(attrs.citations) } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-ai-generated]' }]
  },

  renderHTML({ HTMLAttributes, mark }) {
    const attrs = mark.attrs as AiGeneratedAttrs
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-ai-generated': '',
        class: 'xnet-ai-generated-mark',
        title: aiGeneratedTitle(attrs)
      }),
      0
    ]
  },

  addCommands() {
    return {
      setAiGenerated:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, normalizeAttrs(attrs)),

      setAiGeneratedRange:
        (from, to, attrs) =>
        ({ tr, dispatch }) => {
          const mark = this.type.create(normalizeAttrs(attrs))
          tr.addMark(from, to, mark)
          if (dispatch) dispatch(tr)
          return true
        },

      unsetAiGenerated:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),

      deleteAiGeneratedRanges:
        () =>
        ({ tr, dispatch }) => {
          const ranges = aiGeneratedRanges(tr.doc)
          if (ranges.length === 0) return false
          if (dispatch) {
            // Delete back-to-front so earlier positions stay valid.
            for (const range of [...ranges].reverse()) {
              tr.delete(range.from, range.to)
            }
            dispatch(tr)
          }
          return true
        }
    }
  }
})

function normalizeAttrs(attrs?: Partial<AiGeneratedAttrs>): AiGeneratedAttrs {
  const a = attrs ?? {}
  return { assistMode: a.assistMode ?? 'scaffold', citations: a.citations ?? null }
}
