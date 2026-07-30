import { getCommandRegistry } from '@xnetjs/plugins'
import { applyTokenOverrides, readTokenOverrides, writeTokenOverrides } from '@xnetjs/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applySlotCommand, applyToken, slotCommands } from './lane1'

const KEY = 'lane1-test-theme'

/** Seed persisted overrides for the key under test. */
function seed(initial: Record<string, string> = {}) {
  writeTokenOverrides(KEY, initial)
  applyTokenOverrides(initial)
}

const disposers: Array<() => void> = []

/** Register a slot-shaped command the way `slot-registry` does. */
function registerSlotCommand(id: string, options: { when?: () => boolean; run?: () => void } = {}) {
  const { dispose } = getCommandRegistry().register({
    id,
    title: `View: ${id}`,
    when: options.when,
    run: options.run ?? (() => {})
  })
  disposers.push(dispose)
}

beforeEach(() => {
  disposers.length = 0
  localStorage.clear()
  document.documentElement.style.removeProperty('--accent')
  document.documentElement.style.removeProperty('--surface-1')
})

afterEach(() => {
  for (const dispose of disposers) dispose()
  vi.restoreAllMocks()
})

describe('slotCommands', () => {
  it('finds the commands for exactly that slot', () => {
    registerSlotCommand('slot.open:tasks')
    registerSlotCommand('slot.move:tasks:dock.left')
    registerSlotCommand('slot.open:notes')
    const ids = slotCommands('tasks').map((command) => command.id)
    expect(ids).toContain('slot.open:tasks')
    expect(ids).toContain('slot.move:tasks:dock.left')
    expect(ids).not.toContain('slot.open:notes')
  })

  it('does not match a slot whose id merely starts the same', () => {
    // `tasks` must not pull in `tasks-archive`, or moving one panel silently
    // offers verbs that act on another.
    registerSlotCommand('slot.open:tasks-archive')
    expect(slotCommands('tasks')).toHaveLength(0)
  })

  it('omits commands whose when() says they are unavailable', () => {
    registerSlotCommand('slot.move:tasks:dock.left', { when: () => false })
    registerSlotCommand('slot.move:tasks:dock.right', { when: () => true })
    expect(slotCommands('tasks').map((c) => c.id)).toEqual(['slot.move:tasks:dock.right'])
  })

  it('ignores commands that are not slot verbs', () => {
    registerSlotCommand('workspace.customize')
    expect(slotCommands('tasks')).toHaveLength(0)
  })
})

describe('applySlotCommand', () => {
  it('runs the registered command — never a private mutation path', async () => {
    const run = vi.fn()
    // The unavailable sibling marks where the view currently is.
    registerSlotCommand('slot.move:tasks:dock.left', { when: () => false })
    registerSlotCommand('slot.move:tasks:dock.right', { when: () => true, run })
    await applySlotCommand('tasks', 'slot.move:tasks:dock.right')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('returns an inverse that runs the command for the previous region', async () => {
    // Model the real guard: `when: () => currentRegion !== region`, so moving
    // right makes the left command available again — which is exactly what the
    // inverse relies on.
    let region = 'dock.left'
    const back = vi.fn(() => {
      region = 'dock.left'
    })
    registerSlotCommand('slot.move:tasks:dock.left', {
      when: () => region !== 'dock.left',
      run: back
    })
    registerSlotCommand('slot.move:tasks:dock.right', {
      when: () => region !== 'dock.right',
      run: () => {
        region = 'dock.right'
      }
    })
    const undo = await applySlotCommand('tasks', 'slot.move:tasks:dock.right')
    expect(undo).toBeTypeOf('function')
    expect(await undo?.()).toBe(true)
    expect(back).toHaveBeenCalledTimes(1)
    expect(region).toBe('dock.left')
  })

  it('reports a failed reversal instead of silently doing nothing', async () => {
    // A guard that never re-opens means the inverse cannot run. The caller has
    // to learn that, or the UI clears its Undo and implies success.
    registerSlotCommand('slot.move:tasks:dock.left', { when: () => false })
    registerSlotCommand('slot.move:tasks:dock.right', { when: () => true })
    const undo = await applySlotCommand('tasks', 'slot.move:tasks:dock.right')
    expect(await undo?.()).toBe(false)
  })

  it('returns no inverse when the command did not run', async () => {
    registerSlotCommand('slot.move:tasks:dock.left', { when: () => false })
    expect(await applySlotCommand('tasks', 'slot.move:tasks:dock.left')).toBeUndefined()
    expect(await applySlotCommand('tasks', 'slot.move:tasks:nowhere')).toBeUndefined()
  })

  it('returns no inverse when there is no previous region to go back to', async () => {
    // Every sibling available means the view is not currently placed anywhere
    // we can name — an Undo button here would be a lie.
    registerSlotCommand('slot.move:tasks:dock.left', { when: () => true })
    registerSlotCommand('slot.move:tasks:dock.right', { when: () => true })
    expect(await applySlotCommand('tasks', 'slot.move:tasks:dock.right')).toBeUndefined()
  })
})

describe('applyToken', () => {
  it('sets the token through the theme contract, not a per-element store', () => {
    seed()
    applyToken('--accent', '210 90% 60%', KEY)
    expect(readTokenOverrides(KEY)).toEqual({ '--accent': '210 90% 60%' })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('210 90% 60%')
  })

  it('undo drops the override entirely when there was none before', async () => {
    seed()
    const undo = applyToken('--accent', '210 90% 60%', KEY)
    expect(await undo()).toBe(true)
    // Not "set back to the old computed value" — that would shadow the
    // stylesheet with a copy of itself and stop following the theme.
    expect(readTokenOverrides(KEY)).toEqual({})
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
  })

  it('undo restores the previous override when there was one', async () => {
    seed({ '--accent': '0 0% 50%' })
    const undo = applyToken('--accent', '210 90% 60%', KEY)
    expect(readTokenOverrides(KEY)['--accent']).toBe('210 90% 60%')
    await undo()
    expect(readTokenOverrides(KEY)).toEqual({ '--accent': '0 0% 50%' })
  })

  it('leaves other overrides alone', () => {
    seed({ '--surface-1': '0 0% 98%' })
    applyToken('--accent', '1 2% 3%', KEY)
    expect(readTokenOverrides(KEY)['--surface-1']).toBe('0 0% 98%')
  })
})
