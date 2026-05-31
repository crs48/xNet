import type { Mark, ResolvedPos } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findMarkRange } from './mark-range'
import { getSyntax, getEnabledMarks } from './syntax'

export const inlineMarksPluginKey = new PluginKey('inlineMarks')

export interface InlineMarksPluginOptions {
  /** Which mark types to show syntax for */
  marks?: string[]
  /** CSS class for syntax spans */
  syntaxClass?: string
}

/**
 * Create the inline marks decoration plugin.
 */
export function createInlineMarksPlugin(options: InlineMarksPluginOptions = {}) {
  const enabledMarks = getEnabledMarks(options)
  const syntaxClass = options.syntaxClass ?? 'md-syntax'

  return new Plugin({
    key: inlineMarksPluginKey,

    state: {
      init(_, state) {
        return computeDecorations(state, enabledMarks, syntaxClass)
      },

      apply(tr, oldDecorations, _oldState, newState) {
        if (!tr.selectionSet && !tr.docChanged) {
          return oldDecorations
        }
        return computeDecorations(newState, enabledMarks, syntaxClass)
      }
    },

    props: {
      decorations(state) {
        return this.getState(state)
      }
    }
  })
}

/**
 * Compute decorations for the current selection.
 */
function computeDecorations(
  state: EditorState,
  enabledMarks: string[],
  syntaxClass: string
): DecorationSet {
  const { doc, selection } = state
  const { $from, empty } = selection

  // Only show syntax when cursor is collapsed (not range selection)
  if (!empty) {
    return DecorationSet.empty
  }

  const decorations: Decoration[] = []
  const processedTypes = new Set<string>()

  // Include adjacent marks so syntax reveals at both mark boundaries.
  const marks = getMarksAroundPosition($from)

  for (const mark of marks) {
    const markType = mark.type.name

    if (!enabledMarks.includes(markType)) continue
    if (processedTypes.has(markType)) continue
    processedTypes.add(markType)

    const syntax = getSyntax(markType)
    if (!syntax) continue

    const range = findMarkRange(doc, $from.pos, markType)
    if (!range) continue

    // Create opening syntax widget
    decorations.push(
      Decoration.widget(
        range.from,
        () => createSyntaxSpan(syntax.open, markType, 'open', syntaxClass),
        {
          side: -1,
          key: `${markType}-open-${range.from}`,
          relaxedSide: true,
          ignoreSelection: true
        }
      )
    )

    // Create closing syntax widget
    decorations.push(
      Decoration.widget(
        range.to,
        () => createSyntaxSpan(syntax.close, markType, 'close', syntaxClass),
        {
          side: 1,
          key: `${markType}-close-${range.to}`,
          relaxedSide: true,
          ignoreSelection: true
        }
      )
    )
  }

  return DecorationSet.create(doc, decorations)
}

function getMarksAroundPosition($from: ResolvedPos): Mark[] {
  const marksByType = new Map<string, Mark>()

  for (const mark of $from.marks()) {
    marksByType.set(mark.type.name, mark)
  }

  for (const mark of $from.nodeBefore?.marks ?? []) {
    marksByType.set(mark.type.name, mark)
  }

  for (const mark of $from.nodeAfter?.marks ?? []) {
    marksByType.set(mark.type.name, mark)
  }

  return [...marksByType.values()]
}

/**
 * Create a DOM element for syntax characters.
 */
function createSyntaxSpan(
  text: string,
  markType: string,
  position: 'open' | 'close',
  className: string
): HTMLElement {
  const span = document.createElement('span')
  span.className = `${className} ${className}-${position}`
  span.setAttribute('data-mark', markType)
  span.setAttribute('data-position', position)
  span.setAttribute('aria-hidden', 'true')
  span.textContent = text
  return span
}
