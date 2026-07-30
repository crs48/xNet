/**
 * The canonical New menu's model (0387). These guard the consolidation
 * itself — that the menu offers every creatable noun and that the
 * non-document ones dispatch a command rather than growing domain logic
 * here. The doc-creation half is covered by useCreateInSpace's own path.
 */
import { getCommandRegistry } from '@xnetjs/plugins'
import { describe, expect, it, vi } from 'vitest'
import { NEW_DOC_TYPES, NEW_OTHER_ACTIONS } from './new-actions'

describe('New menu model', () => {
  it('offers the six document types', () => {
    expect([...NEW_DOC_TYPES]).toEqual(['page', 'database', 'canvas', 'dashboard', 'map', 'lab'])
  })

  it('offers the non-document creatables the audit found', () => {
    expect(NEW_OTHER_ACTIONS.map((action) => action.id)).toEqual([
      'task',
      'channel',
      'meeting',
      'space'
    ])
  })

  it('routes every non-document action through a command, not inline logic', () => {
    for (const action of NEW_OTHER_ACTIONS) {
      expect(action.command).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
      expect(action.label.startsWith('New ')).toBe(true)
    }
  })

  it('dispatches the registered command for an action', async () => {
    const registry = getCommandRegistry()
    const run = vi.fn()
    const action = NEW_OTHER_ACTIONS.find((a) => a.id === 'channel')!
    const disposable = registry.register({ id: action.command, title: action.label, run })

    await registry.runCommand(action.command)

    expect(run).toHaveBeenCalledOnce()
    disposable.dispose()
  })

  it('reports a miss when nothing owns the command yet', async () => {
    // QuickCreateHost mounts at the shell; before it does, dispatch is a
    // no-op rather than a throw — the Tasks re-dispatch relies on this.
    await expect(getCommandRegistry().runCommand('spaces.definitelyNotRegistered')).resolves.toBe(
      false
    )
  })
})
