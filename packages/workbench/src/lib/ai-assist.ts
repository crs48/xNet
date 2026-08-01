/**
 * The user's AI assist mode (exploration 0422).
 *
 * `AiAssistMode` has existed in the runtime since the Charter §Agency work,
 * with `draft` documented as "opt-in only" — but nothing in either app read,
 * wrote, or rendered it, so there was no way to opt in. This module is the
 * missing half: a persisted preference the AI settings panel writes and
 * `AiChatPanel` reads when it builds a runtime.
 *
 * Deliberately NOT an `xnet:experiment:*` flag. Labs is staging for features
 * that may change or vanish; this is a standing choice about how the assistant
 * relates to your work, so it lives in Settings › AI and is registered in the
 * capability register with a `settings` surface.
 *
 * The default is `scaffold` and stays `scaffold` when storage is unreadable —
 * a private-mode browser must not silently upgrade anyone into `draft`.
 */
import type { AiAssistMode } from '@xnetjs/plugins'

export const AI_ASSIST_MODE_KEY = 'xnet:ai:assist-mode'

/** The shipped default: the model proposes and cites, the user writes and owns. */
export const DEFAULT_ASSIST_MODE: AiAssistMode = 'scaffold'

const VALID_MODES: readonly AiAssistMode[] = ['scaffold', 'draft']

function isAssistMode(value: unknown): value is AiAssistMode {
  return typeof value === 'string' && VALID_MODES.includes(value as AiAssistMode)
}

/**
 * The active assist mode. Falls back to `scaffold` for missing, unreadable, or
 * unrecognised values — an unparseable preference is not a licence to draft.
 */
export function readAssistMode(): AiAssistMode {
  try {
    const stored = localStorage.getItem(AI_ASSIST_MODE_KEY)
    return isAssistMode(stored) ? stored : DEFAULT_ASSIST_MODE
  } catch {
    return DEFAULT_ASSIST_MODE
  }
}

/**
 * Persist the assist mode. Storing the default clears the key, so a user who
 * never left `scaffold` leaves no entry behind.
 */
export function writeAssistMode(mode: AiAssistMode): void {
  try {
    if (mode === DEFAULT_ASSIST_MODE) localStorage.removeItem(AI_ASSIST_MODE_KEY)
    else localStorage.setItem(AI_ASSIST_MODE_KEY, mode)
  } catch {
    /* storage unavailable (private mode) — the choice just won't stick */
  }
}
