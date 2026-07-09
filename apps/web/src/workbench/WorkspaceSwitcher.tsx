/**
 * WorkspaceSwitcher — saved layouts as nodes (exploration 0280 phase 3).
 *
 * The quick switcher over `xnet:workspace` nodes plus the workspace verbs
 * as palette commands: Save as… forks the current tree into a node,
 * Switch loads one (presets are always listed, seeded or not), Reset
 * returns to the tree's preset provenance, Share opens the normal node
 * ShareDialog — a bench travels like any other node.
 *
 * Only the portable tree lives in the node; pixel sizes stay device-local
 * (react-resizable-panels state keyed by workspaceId in ShellFrame).
 */
import { createNodeId, WorkspaceSchema } from '@xnetjs/data'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useMutate, useQuery } from '@xnetjs/react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@xnetjs/ui'
import { Layers, Save, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type JSX } from 'react'
import { contributeTips } from '../coachmarks'
import { ShareDialog } from '../components/ShareDialog'
import { AGENT_LAYOUT_EVENT } from '../plugins/workspace-agent-module'
import {
  createDefaultTree,
  isPresetWorkspaceId,
  parseWorkspacePayload,
  presetForWorkspaceId,
  serializeWorkspacePayload,
  type WorkspacePayload
} from './layout-tree'
import { useWorkbench } from './state'

// One first-run tip (0206): the layout is yours to keep — say so at the
// button that proves it. Registered for the home list view; the anchor only
// exists in the pinned calm shell, so nobody else ever sees it.
// Arrange-mode first-run tip (0282): anchored at the grab handle, which
// only renders when the malleable shell is on — pinned-legacy users
// never see it.
contributeTips([
  {
    id: 'home:workspace-grab@1',
    view: 'home',
    anchor: '[data-coach="workspace.grab"]',
    title: 'This panel moves',
    body: 'Drag it to another dock — or press ⌘K and type “customize” to arrange everything at once.',
    side: 'right'
  }
])

contributeTips([
  {
    id: 'home:workspace-save@1',
    view: 'home',
    anchor: '[data-coach="workspace.switch"]',
    title: 'Layouts are yours to keep',
    body: 'Arrange the shell, then “Workspace: Save as…” (⌘K) keeps it — switch, share or reset any time.',
    side: 'right'
  }
])

interface WorkspaceRow {
  id: string
  name: string
  preset: string
  tree: unknown
}

/** Sanitize a workspace node into a loadable payload (never trust sync). */
function payloadFromRow(row: WorkspaceRow): WorkspacePayload | null {
  // `preset: 'none'` (the node default) falls out as null in the parser.
  const parsed = parseWorkspacePayload({ name: row.name, preset: row.preset, tree: row.tree })
  if (!parsed) return null
  // The node id is the tree's identity — a forked/duplicated node must not
  // impersonate another workspace's device-local sizes.
  return { ...parsed, tree: { ...parsed.tree, workspaceId: row.id } }
}

/**
 * Agent-change toast (0280 phase 5): when the companion edits the layout
 * it announces the change; this shows "Companion moved Tasks — Undo" with
 * the Undo button running the shared `workspace.undoLayout` command.
 */
function AgentChangeToast(): JSX.Element | null {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onChange = (event: Event) => {
      setMessage((event as CustomEvent<{ message: string }>).detail.message)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), 8000)
    }
    window.addEventListener(AGENT_LAYOUT_EVENT, onChange)
    return () => {
      clearTimeout(timer)
      window.removeEventListener(AGENT_LAYOUT_EVENT, onChange)
    }
  }, [])
  if (!message) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-4 py-2 text-sm text-ink-1 shadow-lg">
      {message}
      <button
        type="button"
        onClick={() => {
          setMessage(null)
          void getCommandRegistry().runCommand('workspace.undoLayout')
        }}
        className="cursor-pointer border-none bg-transparent p-0 text-sm font-medium text-ink-1 underline"
      >
        Undo
      </button>
    </div>
  )
}

export function WorkspaceSwitcher(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [shareFor, setShareFor] = useState<string | null>(null)

  const { data } = useQuery(WorkspaceSchema)
  const { create } = useMutate()

  const rows: WorkspaceRow[] = (data ?? []).map((node) => ({
    id: node.id,
    name: (node.name as string) ?? 'Untitled workspace',
    preset: (node.preset as string) ?? 'none',
    tree: node.tree
  }))
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const createRef = useRef(create)
  createRef.current = create

  // ─── Verbs ─────────────────────────────────────────────────────
  const saveCurrentAs = async (name: string) => {
    const state = useWorkbench.getState()
    const id = createNodeId()
    const preset = presetForWorkspaceId(state.tree.workspaceId)
    const payload = serializeWorkspacePayload({
      name,
      preset,
      tree: { ...state.tree, workspaceId: id }
    })
    await createRef.current(
      WorkspaceSchema,
      {
        name,
        description: '',
        preset: preset ?? 'none',
        system: 'user',
        tree: payload.tree
      },
      id
    )
    state.loadWorkspace(payload)
  }

  const loadRow = (row: WorkspaceRow) => {
    const payload = payloadFromRow(row)
    if (payload) useWorkbench.getState().loadWorkspace(payload)
  }

  useEffect(() => {
    const registry = getCommandRegistry()
    const disposables = [
      registry.register({
        id: 'workspace.switch',
        title: 'Workspace: Switch…',
        run: () => {
          setSaving(false)
          setQuery('')
          setOpen(true)
        }
      }),
      registry.register({
        id: 'workspace.saveAs',
        title: 'Workspace: Save as…',
        run: () => {
          setSaving(true)
          setQuery('')
          setOpen(true)
        }
      }),
      registry.register({
        id: 'workspace.reset',
        title: 'Workspace: Reset layout',
        run: () => {
          useWorkbench
            .getState()
            .loadWorkspace(
              serializeWorkspacePayload({ name: '', preset: null, tree: createDefaultTree() })
            )
        }
      }),
      registry.register({
        id: 'workspace.share',
        title: 'Workspace: Share…',
        when: () => !isPresetWorkspaceId(useWorkbench.getState().tree.workspaceId),
        run: () => setShareFor(useWorkbench.getState().tree.workspaceId)
      })
      // Preset commands (`workspace.preset:*`) register headlessly in
      // plugins/workspace-agent-module.ts, shared with the agent tools.
    ]
    return () => {
      for (const disposable of disposables) disposable.dispose()
    }
  }, [])

  if (shareFor) {
    return (
      <>
        <ShareDialog
          docId={shareFor}
          docType="workspace"
          isOpen
          onClose={() => setShareFor(null)}
        />
        <AgentChangeToast />
      </>
    )
  }

  if (!open) return <AgentChangeToast />
  const close = () => setOpen(false)

  const filtered = rows.filter(
    (row) => !query || row.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onMouseDown={close}
    >
      <div className="w-full max-w-xl" onMouseDown={(event) => event.stopPropagation()}>
        <Command
          shouldFilter={false}
          className="glass-surface overflow-hidden rounded-lg border border-hairline bg-popover shadow-soft"
        >
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={saving ? 'Name this workspace…' : 'Switch workspace…'}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                close()
              }
              if (saving && event.key === 'Enter' && query.trim()) {
                event.preventDefault()
                void saveCurrentAs(query.trim()).then(close)
              }
            }}
          />
          <CommandList className="max-h-96">
            {saving ? (
              <CommandItem
                value="save"
                disabled={!query.trim()}
                onSelect={() => void saveCurrentAs(query.trim()).then(close)}
              >
                <Save size={14} strokeWidth={1.5} className="mr-2 text-ink-3" />
                Save current layout as “{query.trim() || '…'}”
              </CommandItem>
            ) : (
              <>
                <CommandEmpty>No workspaces match.</CommandEmpty>
                {filtered.map((row) => (
                  <CommandItem
                    key={row.id}
                    value={row.id}
                    onSelect={() => {
                      loadRow(row)
                      close()
                    }}
                  >
                    <Layers size={14} strokeWidth={1.5} className="mr-2 text-ink-2" />
                    {row.name}
                  </CommandItem>
                ))}
                <CommandItem
                  value="save-as"
                  onSelect={() => {
                    setSaving(true)
                    setQuery('')
                  }}
                >
                  <Save size={14} strokeWidth={1.5} className="mr-2 text-ink-3" />
                  Save current layout as…
                </CommandItem>
                <CommandItem
                  value="customize"
                  onSelect={() => {
                    close()
                    void getCommandRegistry().runCommand('workspace.customize')
                  }}
                >
                  <SlidersHorizontal size={14} strokeWidth={1.5} className="mr-2 text-ink-3" />
                  Customize layout…
                </CommandItem>
              </>
            )}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}
