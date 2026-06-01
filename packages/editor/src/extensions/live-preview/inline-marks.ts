import type { Mark, ResolvedPos } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findMarkRange } from './mark-range'
import { getSyntax, getEnabledMarks } from './syntax'

export const inlineMarksPluginKey = new PluginKey('inlineMarks')

type InlineMarkBoundarySide = 'open' | 'close'
type InlineMarkBoundaryKey = 'ArrowLeft' | 'ArrowRight' | 'Backspace' | 'Delete'

interface InlineMarkBoundaryContext {
  mark: Mark
  markType: string
  range: {
    from: number
    to: number
  }
  side: InlineMarkBoundarySide
}

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
      },

      handleKeyDown(view, event) {
        return handleInlineMarkBoundaryKeyDown(view, event, enabledMarks)
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

function handleInlineMarkBoundaryKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  enabledMarks: string[]
): boolean {
  if (view.composing) return false

  const { state } = view
  if (!state.selection.empty) return false

  const key = event.key
  if (!isInlineMarkBoundaryKey(key)) {
    return false
  }

  const context = findInlineMarkBoundaryContext(state, enabledMarks)
  if (!context) return false

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    return moveAcrossInlineDelimiter(view, context, key)
  }

  return deleteInlineDelimiter(view, context, key)
}

function findInlineMarkBoundaryContext(
  state: EditorState,
  enabledMarks: string[]
): InlineMarkBoundaryContext | null {
  const { $from } = state.selection
  const beforeMarks = $from.nodeBefore?.marks ?? []
  const afterMarks = $from.nodeAfter?.marks ?? []

  for (const markType of enabledMarks) {
    const beforeMark = beforeMarks.find((mark) => mark.type.name === markType) ?? null
    const afterMark = afterMarks.find((mark) => mark.type.name === markType) ?? null

    if (beforeMark && !afterMark) {
      const range = findMarkRange(state.doc, $from.pos, markType)
      if (!range) continue

      return { mark: beforeMark, markType, range, side: 'close' }
    }

    if (afterMark && !beforeMark) {
      const range = findMarkRange(state.doc, $from.pos, markType)
      if (!range) continue

      return { mark: afterMark, markType, range, side: 'open' }
    }
  }

  return null
}

function isInlineMarkBoundaryKey(key: string): key is InlineMarkBoundaryKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Backspace' || key === 'Delete'
}

function moveAcrossInlineDelimiter(
  view: EditorView,
  context: InlineMarkBoundaryContext,
  key: 'ArrowLeft' | 'ArrowRight'
): boolean {
  const active = isMarkActiveForTyping(view.state, context.mark)

  if (context.side === 'open') {
    if (key === 'ArrowLeft' && active) {
      dispatchStoredMarks(view, removeMarkFromStoredMarks(view.state, context.mark))
      return true
    }

    if (key === 'ArrowRight' && !active) {
      dispatchStoredMarks(view, addMarkToStoredMarks(view.state, context.mark))
      return true
    }
  }

  if (context.side === 'close') {
    if (key === 'ArrowRight' && active) {
      dispatchStoredMarks(view, removeMarkFromStoredMarks(view.state, context.mark))
      return true
    }

    if (key === 'ArrowLeft' && !active) {
      dispatchStoredMarks(view, addMarkToStoredMarks(view.state, context.mark))
      return true
    }
  }

  return false
}

function deleteInlineDelimiter(
  view: EditorView,
  context: InlineMarkBoundaryContext,
  key: 'Backspace' | 'Delete'
): boolean {
  const active = isMarkActiveForTyping(view.state, context.mark)

  if (context.side === 'open') {
    if ((key === 'Backspace' && active) || (key === 'Delete' && !active)) {
      removeInlineMark(view, context)
      return true
    }
  }

  if (context.side === 'close') {
    if ((key === 'Delete' && active) || (key === 'Backspace' && !active)) {
      removeInlineMark(view, context)
      return true
    }
  }

  return false
}

function isMarkActiveForTyping(state: EditorState, mark: Mark): boolean {
  const activeMarks = state.storedMarks ?? state.selection.$from.marks()
  return activeMarks.some((activeMark) => activeMark.eq(mark))
}

function getBaseStoredMarks(state: EditorState): Mark[] {
  return [...(state.storedMarks ?? state.selection.$from.marks())]
}

function addMarkToStoredMarks(state: EditorState, mark: Mark): Mark[] {
  return [...removeMarkFromStoredMarks(state, mark), mark]
}

function removeMarkFromStoredMarks(state: EditorState, mark: Mark): Mark[] {
  return getBaseStoredMarks(state).filter((activeMark) => !activeMark.eq(mark))
}

function dispatchStoredMarks(view: EditorView, marks: Mark[]): void {
  view.dispatch(view.state.tr.setStoredMarks(marks))
}

function removeInlineMark(view: EditorView, context: InlineMarkBoundaryContext): void {
  const { state } = view
  const position = state.selection.from
  const tr = state.tr

  tr.removeMark(context.range.from, context.range.to, context.mark.type)
  preserveBoundarySelection(tr, position)
  tr.setStoredMarks(removeMarkFromStoredMarks(state, context.mark))

  view.dispatch(tr)
}

function preserveBoundarySelection(tr: Transaction, position: number): void {
  const mappedPosition = tr.mapping.map(position)
  const boundedPosition = Math.max(0, Math.min(mappedPosition, tr.doc.content.size))

  tr.setSelection(TextSelection.create(tr.doc, boundedPosition))
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
