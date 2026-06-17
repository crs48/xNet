/**
 * @xnetjs/editor — AI-in-the-editor core (exploration 0194 Phase 3).
 *
 * The reusable engine behind "AI in the editor": read the current selection, run
 * a provider-agnostic transform (rewrite / summarize / expand / …), and replace
 * the selection with the result. The AI call is an **injected** `AiTransformFn`,
 * so the host wires it to `AiSurfaceService` / the BYO-model providers (and an
 * offline fallback) while this stays testable without a real model.
 *
 * Both surfaces the exploration names — the `/ai` slash command and the
 * selection toolbar — call `applyAiTransform`; this module provides that plus the
 * slash-menu items, decoupled from any particular AI provider.
 */

import type { SlashCommandItem } from '../slash-command/items'

/** The supported text transforms. */
export type AiIntent = 'improve' | 'rewrite' | 'summarize' | 'expand' | 'shorten' | 'fix-grammar'

/** A request to transform a span of text. */
export interface AiTransformRequest {
  intent: AiIntent
  selectedText: string
}

/** The injected AI call — provider-agnostic, returns the transformed text. */
export type AiTransformFn = (request: AiTransformRequest) => Promise<string>

export interface AiCommandDeps {
  /** Runs the transform (wire to AiSurfaceService / BYO-model providers). */
  transform: AiTransformFn
  /** Error sink (default: `console.error`). */
  onError?: (error: unknown) => void
}

export interface AiIntentSpec {
  intent: AiIntent
  title: string
  description: string
  icon: string
}

/** The AI transforms offered in the slash menu / selection toolbar. */
export const AI_INTENTS: readonly AiIntentSpec[] = [
  {
    intent: 'improve',
    title: 'AI: Improve writing',
    description: 'Polish the selection',
    icon: '✨'
  },
  { intent: 'rewrite', title: 'AI: Rewrite', description: 'Rephrase the selection', icon: '✨' },
  {
    intent: 'summarize',
    title: 'AI: Summarize',
    description: 'Condense the selection',
    icon: '✨'
  },
  { intent: 'expand', title: 'AI: Expand', description: 'Add detail to the selection', icon: '✨' },
  { intent: 'shorten', title: 'AI: Make shorter', description: 'Trim the selection', icon: '✨' },
  {
    intent: 'fix-grammar',
    title: 'AI: Fix spelling & grammar',
    description: 'Correct the selection',
    icon: '✨'
  }
]

/** The minimal editor surface the transform touches (keeps this unit-testable). */
export interface AiEditorChain {
  focus: () => AiEditorChain
  insertContentAt: (range: { from: number; to: number }, content: string) => AiEditorChain
  deleteRange: (range: { from: number; to: number }) => AiEditorChain
  run: () => boolean
}
export interface AiEditorLike {
  state: {
    selection: { from: number; to: number }
    doc: { textBetween: (from: number, to: number, sep?: string) => string }
  }
  chain: () => AiEditorChain
}

/** The text currently selected in the editor. */
export function selectedText(editor: AiEditorLike): string {
  const { from, to } = editor.state.selection
  return editor.state.doc.textBetween(from, to, ' ')
}

function reportError(deps: AiCommandDeps, error: unknown): void {
  const handler = deps.onError ?? ((e: unknown) => console.error('[ai] transform failed', e))
  handler(error)
}

/**
 * A proposed transform the user can review before it lands — the data behind the
 * diff/approval UI. `before`/`after` + the range are everything a diff needs;
 * nothing has been written to the document yet.
 */
export interface AiTransformPreview {
  intent: AiIntent
  /** The selection range the change targets. */
  from: number
  to: number
  /** The original selected text. */
  before: string
  /** The AI-proposed replacement. */
  after: string
}

/**
 * Run the transform and return a reviewable {@link AiTransformPreview} WITHOUT
 * touching the document. Returns `null` if there was no selection or the
 * transform failed (errors route to `onError`, never thrown at the editor). The
 * host renders the before/after diff and, on approval, calls
 * {@link acceptAiTransform}.
 */
export async function previewAiTransform(
  editor: AiEditorLike,
  intent: AiIntent,
  deps: AiCommandDeps
): Promise<AiTransformPreview | null> {
  const { from, to } = editor.state.selection
  const before = editor.state.doc.textBetween(from, to, ' ')
  if (!before.trim()) return null
  try {
    const after = await deps.transform({ intent, selectedText: before })
    return { intent, from, to, before, after }
  } catch (error) {
    reportError(deps, error)
    return null
  }
}

/** Apply an approved {@link AiTransformPreview} — replace the range with `after`. */
export function acceptAiTransform(editor: AiEditorLike, preview: AiTransformPreview): void {
  editor
    .chain()
    .focus()
    .insertContentAt({ from: preview.from, to: preview.to }, preview.after)
    .run()
}

/**
 * Read the selection, run the transform, and replace the selection with the
 * result in one step (no approval gate). Returns the inserted text, or `null` if
 * there was no selection or the transform failed. For a review-first flow, use
 * {@link previewAiTransform} + {@link acceptAiTransform} instead.
 */
export async function applyAiTransform(
  editor: AiEditorLike,
  intent: AiIntent,
  deps: AiCommandDeps
): Promise<string | null> {
  const preview = await previewAiTransform(editor, intent, deps)
  if (!preview) return null
  acceptAiTransform(editor, preview)
  return preview.after
}

/** Slash-menu items (one per AI intent) that transform the current selection. */
export function createAiSlashCommands(deps: AiCommandDeps): SlashCommandItem[] {
  return AI_INTENTS.map((spec) => ({
    title: spec.title,
    description: spec.description,
    icon: spec.icon,
    searchTerms: ['ai', spec.intent],
    command: ({ editor, range }) => {
      // Drop the typed "/ai…" trigger, then transform whatever is selected.
      const e = editor as unknown as AiEditorLike & { chain: () => AiEditorChain }
      e.chain().focus().deleteRange(range).run()
      void applyAiTransform(e, spec.intent, deps)
    }
  }))
}
