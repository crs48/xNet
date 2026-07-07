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
import { Layers, Save } from 'lucide-react'
import { useEffect, useRef, useState, type JSX } from 'react'
import { ShareDialog } from '../components/ShareDialog'
import {
  isPresetWorkspaceId,
  parseWorkspacePayload,
  PRESET_IDS,
  presetForWorkspaceId,
  serializeWorkspacePayload,
  type PresetId,
  type WorkspacePayload
} from './layout-tree'
import { useWorkbench } from './state'

const PRESET_TITLES: Record<PresetId, string> = {
  quiet: 'Quiet — bare surface',
  calm: 'Calm — everyperson shell',
  bench: 'Bench — full workbench'
}

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
        title: 'Workspace: Reset to preset',
        run: () => {
          const state = useWorkbench.getState()
          const fromId = presetForWorkspaceId(state.tree.workspaceId)
          if (fromId) {
            state.applyPreset(fromId)
            return
          }
          const row = rowsRef.current.find((entry) => entry.id === state.tree.workspaceId)
          const preset = row && row.preset !== 'none' ? (row.preset as PresetId) : 'calm'
          state.applyPreset(preset)
        }
      }),
      registry.register({
        id: 'workspace.share',
        title: 'Workspace: Share…',
        when: () => !isPresetWorkspaceId(useWorkbench.getState().tree.workspaceId),
        run: () => setShareFor(useWorkbench.getState().tree.workspaceId)
      }),
      // Presets are always one command away, seeded or not.
      ...PRESET_IDS.map((preset) =>
        registry.register({
          id: `workspace.preset:${preset}`,
          title: `Workspace: Preset: ${PRESET_TITLES[preset]}`,
          run: () => useWorkbench.getState().applyPreset(preset)
        })
      )
    ]
    return () => {
      for (const disposable of disposables) disposable.dispose()
    }
  }, [])

  if (shareFor) {
    return (
      <ShareDialog docId={shareFor} docType="workspace" isOpen onClose={() => setShareFor(null)} />
    )
  }

  if (!open) return null
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
                {PRESET_IDS.map((preset) => (
                  <CommandItem
                    key={preset}
                    value={`preset-${preset}`}
                    onSelect={() => {
                      useWorkbench.getState().applyPreset(preset)
                      close()
                    }}
                  >
                    <Layers size={14} strokeWidth={1.5} className="mr-2 text-ink-3" />
                    {PRESET_TITLES[preset]}
                  </CommandItem>
                ))}
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
              </>
            )}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}
