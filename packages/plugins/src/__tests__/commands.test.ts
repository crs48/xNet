/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../commands'

function keydown(
  key: string,
  options: Partial<KeyboardEventInit> = {},
  target?: HTMLElement
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...options })
  if (target) {
    Object.defineProperty(event, 'target', { value: target })
  }
  return event
}

describe('CommandRegistry', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new CommandRegistry()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires a global single-key command', () => {
    const run = vi.fn()
    registry.register({ id: 'test.create', title: 'Create', key: 'c', run })

    expect(registry.handleKeyDown(keydown('c'))).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not fire single keys while typing in an input', () => {
    const run = vi.fn()
    registry.register({ id: 'test.create', title: 'Create', key: 'c', run })

    const input = document.createElement('input')
    expect(registry.handleKeyDown(keydown('c', {}, input))).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('fires modifier combos inside inputs only with allowInInput', () => {
    const blocked = vi.fn()
    const allowed = vi.fn()
    registry.register({ id: 'test.blocked', title: 'Blocked', key: 'Mod-B', run: blocked })
    registry.register({
      id: 'test.allowed',
      title: 'Allowed',
      key: 'Mod-K',
      allowInInput: true,
      run: allowed
    })

    const input = document.createElement('input')
    registry.handleKeyDown(keydown('b', { ctrlKey: true }, input))
    registry.handleKeyDown(keydown('k', { ctrlKey: true }, input))

    expect(blocked).not.toHaveBeenCalled()
    expect(allowed).toHaveBeenCalledTimes(1)
  })

  it('only fires scoped commands while their scope is active', () => {
    const run = vi.fn()
    registry.register({ id: 'task.status', title: 'Status', scope: 'task-focused', key: 's', run })

    expect(registry.handleKeyDown(keydown('s'))).toBe(false)

    const activation = registry.activateScope('task-focused')
    expect(registry.handleKeyDown(keydown('s'))).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)

    activation.dispose()
    expect(registry.handleKeyDown(keydown('s'))).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('resolves key conflicts to the most recently activated scope', () => {
    const globalRun = vi.fn()
    const focusedRun = vi.fn()
    registry.register({ id: 'global.s', title: 'Global S', key: 's', run: globalRun })
    registry.register({
      id: 'task.s',
      title: 'Task S',
      scope: 'task-focused',
      key: 's',
      run: focusedRun
    })

    registry.activateScope('task-focused')
    registry.handleKeyDown(keydown('s'))

    expect(focusedRun).toHaveBeenCalledTimes(1)
    expect(globalRun).not.toHaveBeenCalled()
  })

  it('supports g-chords with a pending timeout', () => {
    const run = vi.fn()
    registry.register({ id: 'nav.tasks', title: 'Go to tasks', key: 'g t', run })

    expect(registry.handleKeyDown(keydown('g'))).toBe(true)
    expect(run).not.toHaveBeenCalled()
    expect(registry.handleKeyDown(keydown('t'))).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)

    // Pending step expires after the timeout
    registry.handleKeyDown(keydown('g'))
    vi.advanceTimersByTime(1500)
    expect(registry.handleKeyDown(keydown('t'))).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('respects when() guards', () => {
    const run = vi.fn()
    let ready = false
    registry.register({ id: 'test.guarded', title: 'Guarded', key: 'x', when: () => ready, run })

    expect(registry.handleKeyDown(keydown('x'))).toBe(false)
    ready = true
    expect(registry.handleKeyDown(keydown('x'))).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('lists available commands by active scope for the palette', () => {
    registry.register({ id: 'a', title: 'A', run: vi.fn() })
    registry.register({ id: 'b', title: 'B', scope: 'surface:grid', run: vi.fn() })
    registry.register({
      id: 'c',
      title: 'C',
      scope: 'surface:grid',
      when: () => false,
      run: vi.fn()
    })

    expect(registry.getAvailableCommands().map((c) => c.id)).toEqual(['a'])

    registry.activateScope('surface:grid')
    expect(registry.getAvailableCommands().map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('lists commands by scope regardless of activation (commandsForScopes)', () => {
    registry.register({ id: 'g', title: 'G', run: vi.fn() })
    registry.register({ id: 'tf', title: 'TF', scope: 'task-focused', run: vi.fn() })
    registry.register({
      id: 'tf-guarded',
      title: 'TF guarded',
      scope: 'task-focused',
      when: () => false,
      run: vi.fn()
    })

    // task-focused is NOT active, but commandsForScopes still surfaces it.
    expect(registry.commandsForScopes(['global', 'task-focused']).map((c) => c.id)).toEqual([
      'g',
      'tf'
    ])
    expect(registry.commandsForScopes(['task-focused']).map((c) => c.id)).toEqual(['tf'])
  })

  it('runs palette commands by id', async () => {
    const run = vi.fn()
    registry.register({ id: 'test.run', title: 'Run', run })

    await expect(registry.runCommand('test.run')).resolves.toBe(true)
    await expect(registry.runCommand('missing')).resolves.toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('disposing a registration removes the command', () => {
    const run = vi.fn()
    const disposable = registry.register({ id: 'test.gone', title: 'Gone', key: 'z', run })

    disposable.dispose()
    expect(registry.handleKeyDown(keydown('z'))).toBe(false)
  })
})
