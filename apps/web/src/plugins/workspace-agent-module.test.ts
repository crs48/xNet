/**
 * Workspace agent tools (0280): mutations go through registered commands,
 * are undoable via workspace.undoLayout, and announce themselves.
 */
import { getCommandRegistry } from '@xnetjs/plugins'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerBuiltinSlotViews } from '../workbench/builtin-slot-views'
import { regionOf } from '../workbench/layout-tree'
import { useWorkbench } from '../workbench/state'
import {
  AGENT_LAYOUT_EVENT,
  registerWorkspaceCommands,
  WorkspaceAgentModule,
  workspaceUndoDepth
} from './workspace-agent-module'

const tools = Object.fromEntries(
  (WorkspaceAgentModule.contributes?.agentTools ?? []).map((tool) => [tool.name, tool])
)

registerBuiltinSlotViews()
const disposeUndo = registerWorkspaceCommands()
void disposeUndo

beforeEach(() => {
  useWorkbench.getState().applyPreset('calm')
  while (workspaceUndoDepth() > 0) {
    void getCommandRegistry().runCommand('workspace.undoLayout')
  }
})

describe('workspace agent tools', () => {
  it('declares a closed network and only the Workspace schema', () => {
    expect(WorkspaceAgentModule.capabilities?.network).toEqual([])
    expect(WorkspaceAgentModule.capabilities?.schemaWrite).toEqual([
      'xnet://xnet.fyi/Workspace@1.0.0'
    ])
  })

  it('describes the current layout', async () => {
    const text = (await tools.workspace_describe_layout.invoke({})) as string
    expect(text).toContain('chrome: pinned')
    expect(text).toContain('dock.left: navigator (pinned)')
  })

  it('moves a view via slot.move, announces it, and is undoable', async () => {
    const events: string[] = []
    const listener = (event: Event) =>
      events.push((event as CustomEvent<{ message: string }>).detail.message)
    window.addEventListener(AGENT_LAYOUT_EVENT, listener)

    await tools.workspace_move_view.invoke({ viewId: 'context', region: 'dock.left' })
    expect(regionOf(useWorkbench.getState().tree, 'context')).toBe('dock.left')
    expect(events[0]).toContain('Context')
    expect(workspaceUndoDepth()).toBe(1)

    await getCommandRegistry().runCommand('workspace.undoLayout')
    expect(regionOf(useWorkbench.getState().tree, 'context')).not.toBe('dock.left')
    expect(workspaceUndoDepth()).toBe(0)
    window.removeEventListener(AGENT_LAYOUT_EVENT, listener)
  })

  it('moves a view via slot.move and reports the landing region', async () => {
    const reply = (await tools.workspace_move_view.invoke({
      viewId: 'context',
      region: 'dock.left'
    })) as string
    expect(reply).toContain('Moved Context to dock.left')
    expect(regionOf(useWorkbench.getState().tree, 'context')).toBe('dock.left')
  })

  it('rejects unknown views with the known list', async () => {
    await expect(
      tools.workspace_move_view.invoke({ viewId: 'nope', region: 'dock.left' })
    ).rejects.toThrow(/unknown view: nope/)
  })
})

describe('workspace_scaffold_view (0280 L5)', () => {
  it('scaffolds a network-closed slot-view draft with consent preview', async () => {
    const result = (await tools.workspace_scaffold_view.invoke({
      id: 'com.you.focus-board',
      name: 'Focus Board',
      schemaRead: ['xnet://xnet.fyi/Task@1.0.0']
    })) as { files: Record<string, string>; trustTier: string; consentLines: string[] }
    expect(result.files['src/index.ts']).toContain("defaultRegion: 'dock.corner'")
    expect(result.files['src/index.ts']).toContain('"network":[]')
    expect(result.trustTier).toBe('user')
    expect(result.consentLines).toEqual(['Read your Task'])
  })
})
