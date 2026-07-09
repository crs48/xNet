/**
 * Workspace agent module (exploration 0280 phase 5).
 *
 * The companion as a shell citizen: model-facing tools that edit the
 * workspace by EMITTING THE SAME REGISTERED COMMANDS the palette and drag
 * handles run — never private state. Every mutation snapshots the prior
 * tree onto an undo stack (surfaced as the `workspace.undoLayout` command
 * and an agent-change toast), so "Companion moved Tasks" is one Undo away.
 *
 * Declared as a FeatureModule so the capability surface is explicit: it
 * may read/write Workspace nodes (via the commands it triggers), touches
 * no other schemas, and declares `network: []` — provably offline.
 */
import type { FeatureModule, ModuleCapabilities } from '@xnetjs/plugins'
import { evaluateInstallConsent, getCommandRegistry, scaffoldPlugin } from '@xnetjs/plugins'
import {
  REGION_IDS,
  regionOf,
  serializeWorkspacePayload,
  type LayoutTree,
  type RegionId
} from '../workbench/layout-tree'
import { getSlotView, getSlotViews } from '../workbench/slot-registry'
import { useWorkbench } from '../workbench/state'

/** Fired after an agent-driven layout change; the shell shows an Undo toast. */
export const AGENT_LAYOUT_EVENT = 'xnet:workspace:agent-change'

const undoStack: LayoutTree[] = []
const MAX_UNDO = 10

function snapshot(): void {
  undoStack.push(useWorkbench.getState().tree)
  if (undoStack.length > MAX_UNDO) undoStack.shift()
}

function announce(message: string): void {
  window.dispatchEvent(new CustomEvent(AGENT_LAYOUT_EVENT, { detail: { message } }))
}

/** Run a registered command; the tools never mutate the store directly. */
async function emit(commandId: string): Promise<void> {
  await getCommandRegistry().runCommand(commandId)
}

function describeTree(tree: LayoutTree): string {
  const lines = REGION_IDS.filter((region) => tree.regions[region].length > 0).map((region) => {
    const views = tree.regions[region]
      .map((placement) => `${placement.viewId} (${placement.tier})`)
      .join(', ')
    return `${region}: ${views}`
  })
  return [
    `workspace: ${tree.workspaceId}`,
    `chrome: ${tree.chrome}; tabs: ${tree.surface.tabsEnabled}`,
    ...lines
  ].join('\n')
}

export const WorkspaceAgentModule: FeatureModule = {
  id: 'fyi.xnet.workspace-agent',
  name: 'Workspace agent tools',
  version: '1.0.0',
  description:
    'Lets your agent arrange the shell through the same undoable commands you use (0280)',
  capabilities: {
    schemaRead: ['xnet://xnet.fyi/Workspace@1.0.0'],
    schemaWrite: ['xnet://xnet.fyi/Workspace@1.0.0'],
    network: []
  },
  contributes: {
    agentTools: [
      {
        id: 'fyi.xnet.workspace-agent.describe',
        name: 'workspace_describe_layout',
        description:
          'Read the current shell layout: regions, placed views and their disclosure tiers.',
        risk: 'low',
        invoke: () => describeTree(useWorkbench.getState().tree)
      },
      {
        id: 'fyi.xnet.workspace-agent.move-view',
        name: 'workspace_move_view',
        description:
          'Move a shell view to another dock region. Views and regions come from workspace_describe_layout. Undoable.',
        risk: 'medium',
        inputSchema: {
          type: 'object',
          properties: {
            viewId: { type: 'string', description: 'Slot view id (e.g. tasks, navigator)' },
            region: {
              type: 'string',
              enum: ['dock.left', 'dock.right', 'dock.bottom', 'dock.corner'],
              description: 'Destination region'
            }
          },
          required: ['viewId', 'region']
        },
        invoke: async (args) => {
          const viewId = String(args.viewId)
          const region = args.region as RegionId
          const view = getSlotView(viewId)
          if (!view) {
            const known = getSlotViews()
              .map((entry) => entry.id)
              .join(', ')
            throw new Error(`unknown view: ${viewId}. Known views: ${known}`)
          }
          snapshot()
          await emit(`slot.move:${viewId}:${region}`)
          const landed = regionOf(useWorkbench.getState().tree, viewId)
          announce(`Companion moved ${view.label} to ${region}`)
          return landed === region
            ? `Moved ${view.label} to ${region}. Undo: workspace.undoLayout.`
            : `Could not move ${view.label} to ${region} (not allowed there).`
        }
      },
      {
        id: 'fyi.xnet.workspace-agent.open-view',
        name: 'workspace_open_view',
        description: 'Open a shell view in whichever dock currently holds it.',
        risk: 'low',
        inputSchema: {
          type: 'object',
          properties: { viewId: { type: 'string', description: 'Slot view id' } },
          required: ['viewId']
        },
        invoke: async (args) => {
          const viewId = String(args.viewId)
          if (!getSlotView(viewId)) throw new Error(`unknown view: ${viewId}`)
          await emit(`slot.open:${viewId}`)
          return `Opened ${viewId}.`
        }
      },
      {
        id: 'fyi.xnet.workspace-agent.save',
        name: 'workspace_save_layout',
        description:
          'Ask the user to save the current layout as a named workspace (opens the save dialog for their confirmation — the agent never saves silently).',
        risk: 'low',
        invoke: async () => {
          await emit('workspace.saveAs')
          return 'Save dialog opened; the user confirms the name.'
        }
      },
      {
        id: 'fyi.xnet.workspace-agent.scaffold',
        name: 'workspace_scaffold_view',
        description:
          'Scaffold a new dockable shell view as an installable plugin draft (0280 L5). Returns the generated files plus the consent lines the user will see. The manifest defaults to NO network access; installation always goes through the consent dialog at the ai-generated trust tier — the agent never installs silently.',
        risk: 'medium',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Reverse-domain plugin id (e.g. com.you.focus-board)'
            },
            name: { type: 'string', description: 'Human-readable view name' },
            schemaRead: {
              type: 'array',
              items: { type: 'string' },
              description: 'Schema IRIs the view may read (empty = none)'
            }
          },
          required: ['id', 'name']
        },
        invoke: (args) => {
          const capabilities: ModuleCapabilities = {
            schemaRead: (args.schemaRead as string[] | undefined) ?? [],
            network: [] // provably offline by default (the essay's kitchen)
          }
          const { files } = scaffoldPlugin({
            id: String(args.id),
            name: String(args.name),
            template: 'slot-view',
            capabilities
          })
          const consent = evaluateInstallConsent('ai-generated', capabilities)
          return {
            files,
            trustTier: consent.tier,
            consentLines: consent.lines.map((line) => line.text),
            note: 'Draft only — review the files, then install via the marketplace/devkit flow; the consent dialog will show these lines.'
          }
        }
      },
      {
        id: 'fyi.xnet.workspace-agent.undo',
        name: 'workspace_undo_layout',
        description: 'Undo the last agent-driven layout change.',
        risk: 'low',
        invoke: async () => {
          await emit('workspace.undoLayout')
          return 'Reverted the last layout change.'
        }
      }
    ]
  }
}

/**
 * The workspace verbs that need no React state: layout undo (also the
 * toast's Undo button) and Arrange mode. With one shell (0284) there are no
 * presets to switch between — customize/move/save are the layout verbs.
 * Registered once at module load — agent tools, palette and UI all go
 * through these commands.
 */
export function registerWorkspaceCommands(): () => void {
  const registry = getCommandRegistry()
  const disposables = [
    registry.register({
      id: 'workspace.undoLayout',
      title: 'Workspace: Undo layout change',
      when: () => undoStack.length > 0,
      run: () => {
        const previous = undoStack.pop()
        if (!previous) return
        useWorkbench
          .getState()
          .loadWorkspace(serializeWorkspacePayload({ name: '', preset: null, tree: previous }))
      }
    }),
    // Arrange mode (0282): the shell as an editable schematic.
    registry.register({
      id: 'workspace.customize',
      title: 'Workspace: Customize layout…',
      run: () => useWorkbench.getState().setArranging(true)
    })
  ]
  return () => {
    for (const disposable of disposables) disposable.dispose()
  }
}

/** Test seam: the current undo depth. */
export function workspaceUndoDepth(): number {
  return undoStack.length
}
