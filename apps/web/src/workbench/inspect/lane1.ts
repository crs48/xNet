/**
 * Lane 1 appliers — token and layout changes with no code and no git
 * (exploration 0399, W2).
 *
 * Two rules hold this file together:
 *
 * 1. **Nothing here invents a mutation path.** A layout change runs a command
 *    that is *already registered* by `slot-registry`, the same one the palette
 *    and the drag handles run. A token change goes through `ThemeProvider`. If
 *    a change cannot be expressed that way, it is not a Lane 1 change.
 * 2. **Every applier returns its own inverse.** The Undo affordance is not a
 *    global history: it is the specific reversal of the specific thing just
 *    done, captured before it happened.
 */
import { getCommandRegistry, type WorkspaceCommand } from '@xnetjs/plugins'
import { clearThemeToken, readTokenOverrides, setThemeToken } from '@xnetjs/ui'

/**
 * A reversal of one applied Lane 1 change.
 *
 * Resolves `false` when the reversal could not run — a layout undo depends on
 * the target command's `when()` guard having flipped back, and if it has not,
 * the caller must say so rather than clear the button and imply success.
 */
export type Undo = () => Promise<boolean>

/**
 * The registered commands that act on one slot, filtered to those available now.
 *
 * Derived from the registry rather than rebuilt, so a view whose
 * `movableRegions` exclude a dock simply has no button for it — the constraint
 * lives in one place.
 */
export function slotCommands(slotId: string): WorkspaceCommand[] {
  const escaped = `:${slotId}`
  return getCommandRegistry()
    .getAllCommands()
    .filter((command) => {
      if (!command.id.startsWith('slot.')) return false
      // `slot.move:<id>:<region>` / `slot.open:<id>` — match the id segment
      // exactly so `tasks` does not also match a view called `tasks-archive`.
      const rest = command.id.slice(command.id.indexOf(':'))
      return rest === escaped || rest.startsWith(`${escaped}:`)
    })
    .filter((command) => (command.when ? command.when() : true))
}

/**
 * Run a registered slot command and return the reversal.
 *
 * The inverse is computed from the registry state *before* the command runs:
 * afterwards the `when()` guard of the command we came from has flipped, and
 * there is no way to ask "where was this a moment ago".
 */
export async function applySlotCommand(
  slotId: string,
  commandId: string
): Promise<Undo | undefined> {
  const registry = getCommandRegistry()
  // The sibling move command that is currently *unavailable* is the one whose
  // region the view already occupies — that is where Undo must put it back.
  const before = registry
    .getAllCommands()
    .filter((command) => command.id.startsWith(`slot.move:${slotId}:`))
    .find((command) => command.when && !command.when())?.id

  const ran = await registry.runCommand(commandId)
  if (!ran) return undefined
  if (!before) return undefined
  return () => registry.runCommand(before)
}

/** Read a token's effective value, override or stylesheet. */
export function readToken(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * The theme storage key the web app's provider uses.
 *
 * Shared explicitly rather than read from React context: the inspect overlay is
 * mounted at the application root so it also covers the onboarding and loading
 * screens, which renders it OUTSIDE the provider `App` sets up. Calling
 * `useTheme()` there threw and took the whole app down — a debugging aid must
 * not be able to brick what it inspects.
 */
export const WEB_THEME_STORAGE_KEY = 'xnet-web-theme'

/**
 * Apply a token value through the shared theme contract, returning the reversal.
 *
 * `wasOverridden` distinguishes "restore the previous override" from "drop the
 * override entirely" — collapsing those would leave the stylesheet's own value
 * shadowed by a copy of itself, which looks identical until the theme changes
 * and then silently ignores it.
 */
export function applyToken(
  name: string,
  value: string,
  storageKey: string = WEB_THEME_STORAGE_KEY
): Undo {
  const before = readTokenOverrides(storageKey)
  const previous = before[name]
  const wasOverridden = name in before
  setThemeToken(storageKey, name, value)
  return async () => {
    if (wasOverridden) setThemeToken(storageKey, name, previous)
    else clearThemeToken(storageKey, name)
    return true
  }
}
