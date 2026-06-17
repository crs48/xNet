/**
 * Workspace Command Registry
 *
 * One registry for every keyboard-driven verb in the workspace
 * (exploration 0161, phase 3). Generalizes ShortcutManager with:
 *
 * - **Scopes**: commands belong to a scope ('global', 'surface:grid',
 *   'task-focused', …). Surfaces activate their scope on focus/mount and
 *   dispose on blur/unmount; only commands in active scopes fire. The most
 *   recently activated scope wins key conflicts (global loses to all).
 * - **Single-key verbs**: Linear-style bindings ('s', 'a', 'p') that are
 *   automatically suppressed while any input/textarea/contenteditable has
 *   focus — modifier combos can opt into editors via `allowInInput`.
 * - **Chords**: 'g t'-style two-step sequences with a pending-step timeout.
 *
 * Surfaces register commands instead of owning their own key handling, so
 * the palette can list every available action with its binding.
 */

import type { Disposable } from './types'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CommandScope = 'global' | (string & NonNullable<unknown>)

export interface CommandContext {
  /** The scope the command was resolved in */
  scope: CommandScope
  /** The triggering keyboard event (absent when run from the palette) */
  event?: KeyboardEvent
}

export interface WorkspaceCommand {
  /** Unique id, e.g. 'task.setStatus' */
  id: string
  /** Palette title, e.g. 'Change status…' */
  title: string
  /** Scope this command belongs to (default 'global') */
  scope?: CommandScope
  /**
   * Key binding: a single key ('s', '?'), a modifier combo ('Mod-K'),
   * or a space-separated chord ('g t'). Omit for palette-only commands.
   */
  key?: string
  /** Allow firing while an input/editor has focus (modifier combos only) */
  allowInInput?: boolean
  /** Availability guard checked at dispatch and palette-listing time */
  when?: () => boolean
  run: (context: CommandContext) => void | Promise<void>
}

interface KeyStep {
  mods: string[]
  key: string
}

const CHORD_TIMEOUT_MS = 1000
const MODIFIERS = ['ctrl', 'meta', 'alt', 'shift']

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return Boolean(navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac'))
}

function normalizeKeyName(key: string): string {
  const lower = key.toLowerCase()
  if (lower === ' ' || lower === 'space') return 'space'
  if (lower === 'arrowup') return 'up'
  if (lower === 'arrowdown') return 'down'
  if (lower === 'arrowleft') return 'left'
  if (lower === 'arrowright') return 'right'
  return lower
}

/** Parse 'Mod-Shift-K' / 's' / 'g t' into normalized steps. */
function parseBinding(binding: string): KeyStep[] {
  const mac = isMac()

  return binding
    .trim()
    .split(/\s+/)
    .map((step) => {
      const parts = step.replace(/Mod/g, mac ? 'Meta' : 'Ctrl').split('-')
      const mods = parts
        .map((part) => part.toLowerCase())
        .filter((part) => MODIFIERS.includes(part))
        .sort()
      const key = parts.map((part) => part.toLowerCase()).find((part) => !MODIFIERS.includes(part))

      return { mods, key: normalizeKeyName(key ?? '') }
    })
}

function stepToString(step: KeyStep): string {
  return [...step.mods, step.key].join('-')
}

function eventToStep(event: KeyboardEvent): KeyStep | null {
  const key = normalizeKeyName(event.key)
  if (MODIFIERS.includes(key) || key === 'control') return null

  const mods: string[] = []
  if (event.ctrlKey) mods.push('ctrl')
  if (event.metaKey) mods.push('meta')
  if (event.altKey) mods.push('alt')
  // Shift is implicit for printable single characters ('?' arrives as
  // shift+/ with key='?'); only track it for non-printable keys.
  if (event.shiftKey && event.key.length > 1) mods.push('shift')

  return { mods: mods.sort(), key }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return true
  }
  return target.isContentEditable
}

// ─── Registry ────────────────────────────────────────────────────────────────

export class CommandRegistry {
  private commands = new Map<string, WorkspaceCommand>()
  /** Active scopes in activation order ('global' is always index 0) */
  private scopeStack: CommandScope[] = ['global']
  private pendingSteps: string[] = []
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private enabled = true

  register(command: WorkspaceCommand): Disposable {
    this.commands.set(command.id, command)

    return {
      dispose: () => {
        this.commands.delete(command.id)
      }
    }
  }

  /**
   * Activate a scope (e.g. when a surface mounts or a task row gains
   * focus). Re-activating moves it to the top of the priority stack.
   */
  activateScope(scope: CommandScope): Disposable {
    if (scope !== 'global') {
      this.scopeStack = this.scopeStack.filter((existing) => existing !== scope)
      this.scopeStack.push(scope)
    }

    return {
      dispose: () => {
        if (scope !== 'global') {
          this.scopeStack = this.scopeStack.filter((existing) => existing !== scope)
        }
      }
    }
  }

  isScopeActive(scope: CommandScope): boolean {
    return this.scopeStack.includes(scope)
  }

  getActiveScopes(): CommandScope[] {
    return [...this.scopeStack]
  }

  /** Commands available right now (active scope + passing when()) */
  getAvailableCommands(): WorkspaceCommand[] {
    return [...this.commands.values()].filter((command) => {
      const scope = command.scope ?? 'global'
      if (!this.scopeStack.includes(scope)) return false
      return command.when ? command.when() : true
    })
  }

  getAllCommands(): WorkspaceCommand[] {
    return [...this.commands.values()]
  }

  /**
   * Commands declared in any of the given scopes (passing `when()`),
   * regardless of whether those scopes are currently active. Lets a
   * context-aware command menu surface, say, the focused-task verbs even
   * when its own input has stolen scope focus.
   */
  commandsForScopes(scopes: readonly CommandScope[]): WorkspaceCommand[] {
    const wanted = new Set(scopes)
    return [...this.commands.values()].filter((command) => {
      if (!wanted.has(command.scope ?? 'global')) return false
      return command.when ? command.when() : true
    })
  }

  getCommand(id: string): WorkspaceCommand | undefined {
    return this.commands.get(id)
  }

  async runCommand(id: string): Promise<boolean> {
    const command = this.commands.get(id)
    if (!command) return false
    if (command.when && !command.when()) return false

    await command.run({ scope: command.scope ?? 'global' })
    return true
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.clearPending()
  }

  /**
   * Handle a keydown. Returns true when a command fired (or a chord step
   * was consumed); callers should attach exactly one handler per window.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.enabled) return false

    const step = eventToStep(event)
    if (!step) return false

    const stepString = stepToString(step)
    const inEditable = isEditableTarget(event.target)
    const sequence = [...this.pendingSteps, stepString]

    let exactMatch: { command: WorkspaceCommand; priority: number } | null = null
    let hasPrefixMatch = false

    for (const command of this.commands.values()) {
      if (!command.key) continue

      const scope = command.scope ?? 'global'
      const priority = this.scopeStack.lastIndexOf(scope)
      if (priority === -1) continue

      if (inEditable) {
        // Inside inputs/editors only explicit opt-ins with a real modifier fire.
        const hasModifier = step.mods.some((mod) => mod !== 'shift')
        if (!command.allowInInput || !hasModifier) continue
      }

      const steps = parseBinding(command.key).map(stepToString)

      if (steps.length === sequence.length && steps.every((s, i) => s === sequence[i])) {
        if (command.when && !command.when()) continue
        if (!exactMatch || priority > exactMatch.priority) {
          exactMatch = { command, priority }
        }
      } else if (steps.length > sequence.length && sequence.every((s, i) => s === steps[i])) {
        hasPrefixMatch = true
      }
    }

    if (exactMatch) {
      event.preventDefault()
      event.stopPropagation()
      this.clearPending()

      const { command } = exactMatch
      Promise.resolve(command.run({ scope: command.scope ?? 'global', event })).catch((err) => {
        console.error(`[CommandRegistry] Command '${command.id}' failed:`, err)
      })

      return true
    }

    if (hasPrefixMatch) {
      event.preventDefault()
      this.pendingSteps = sequence
      if (this.pendingTimer) clearTimeout(this.pendingTimer)
      this.pendingTimer = setTimeout(() => this.clearPending(), CHORD_TIMEOUT_MS)
      return true
    }

    this.clearPending()
    return false
  }

  /** Format a binding for display ('Mod-K' → '⌘K' on Mac). */
  formatForDisplay(binding: string): string {
    const mac = isMac()
    return binding
      .split(/\s+/)
      .map((step) =>
        step
          .replace(/Mod/g, mac ? '⌘' : 'Ctrl')
          .replace(/Ctrl/g, mac ? '⌃' : 'Ctrl')
          .replace(/Alt/g, mac ? '⌥' : 'Alt')
          .replace(/Shift/g, mac ? '⇧' : 'Shift')
          .replace(/Meta/g, mac ? '⌘' : 'Win')
          .replace(/-/g, mac ? '' : '+')
          .toUpperCase()
      )
      .join(' ')
  }

  clear(): void {
    this.commands.clear()
    this.scopeStack = ['global']
    this.clearPending()
  }

  private clearPending(): void {
    this.pendingSteps = []
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
  }
}

// ─── Global instance ─────────────────────────────────────────────────────────

let globalCommandRegistry: CommandRegistry | null = null

export function getCommandRegistry(): CommandRegistry {
  if (!globalCommandRegistry) {
    globalCommandRegistry = new CommandRegistry()
  }
  return globalCommandRegistry
}

/**
 * Install the global command handler on the window.
 * Call once at app startup.
 */
export function installCommandHandler(): () => void {
  const registry = getCommandRegistry()

  const handler = (event: KeyboardEvent) => {
    registry.handleKeyDown(event)
  }

  window.addEventListener('keydown', handler, true)

  return () => {
    window.removeEventListener('keydown', handler, true)
  }
}
