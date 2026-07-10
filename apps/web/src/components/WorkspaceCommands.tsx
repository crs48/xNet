/**
 * WorkspaceCommands - installs the global command handler and registers
 * workspace-wide keyboard commands (g-chord navigation, ? help overlay).
 *
 * Surfaces register their own scoped commands; this component owns only
 * the global layer and the shortcut-help overlay (exploration 0161,
 * phase 3).
 */
import { useNavigate } from '@tanstack/react-router'
import { getCommandRegistry, installCommandHandler } from '@xnetjs/plugins'
import { useGlobalUndo, useIdentity } from '@xnetjs/react'
import { useEffect, useRef, useState, type JSX } from 'react'
import { deskIdFor } from '../lib/desk'
import { navigateToNode } from '../workbench/navigation'
import { selectActiveTab, useWorkbench } from '../workbench/state'
import { setPreviewIntent } from '../workbench/tabs'
import { SCHEMA_IDS, isExplorerNodeType } from '../workbench/views/explorer-items'

export function WorkspaceCommands(): JSX.Element | null {
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)

  // The Desk (0273): identity-derived id, held in a ref so the commands
  // register once but always resolve the current identity. `did` (not
  // `identity`) — it falls back to authorDID under the test bypass.
  const { did } = useIdentity()
  const didRef = useRef<string | null>(null)
  didRef.current = did

  // App-wide undo/redo (0179). Held in a ref so the commands register once
  // but always call the current handlers. allowInInput is left off so the
  // rich-text editor (TipTap) and plain inputs keep their own Cmd+Z; the
  // canvas overrides via a higher-priority 'surface:canvas' scope.
  const undo = useGlobalUndo()
  const undoRef = useRef(undo)
  undoRef.current = undo

  useEffect(() => {
    const registry = getCommandRegistry()
    const uninstall = installCommandHandler()

    const disposables = [
      registry.register({
        id: 'edit.undo',
        title: 'Undo',
        key: 'Mod-Z',
        run: () => void undoRef.current.undo()
      }),
      registry.register({
        id: 'edit.redo',
        title: 'Redo',
        key: 'Mod-Shift-Z',
        run: () => void undoRef.current.redo()
      }),
      registry.register({
        id: 'edit.redoAlt',
        title: 'Redo (alternate binding)',
        key: 'Mod-Y',
        run: () => void undoRef.current.redo()
      }),
      registry.register({
        id: 'nav.home',
        title: 'Go to home',
        key: 'g h',
        run: () => void navigate({ to: '/' })
      }),
      registry.register({
        id: 'nav.tasks',
        title: 'Go to tasks',
        key: 'g t',
        // Open as a preview tab (0288), same as clicking the surface.
        run: () => {
          setPreviewIntent()
          void navigate({ to: '/tasks' })
        }
      }),
      registry.register({
        id: 'nav.meetings',
        title: 'Go to meetings',
        key: 'g e',
        run: () => {
          setPreviewIntent()
          void navigate({ to: '/meetings' })
        }
      }),
      registry.register({
        id: 'nav.data',
        title: 'Go to data workspace',
        key: 'g d',
        run: () => {
          setPreviewIntent()
          void navigate({ to: '/data' })
        }
      }),
      registry.register({
        id: 'nav.finance',
        title: 'Go to finance',
        key: 'g f',
        run: () => {
          setPreviewIntent()
          void navigate({ to: '/finance' })
        }
      }),
      registry.register({
        id: 'nav.discover',
        title: 'Discover people',
        key: 'g m',
        run: () => void navigate({ to: '/discover' })
      }),
      registry.register({
        id: 'nav.settings',
        title: 'Go to settings',
        key: 'g s',
        run: () => {
          setPreviewIntent()
          void navigate({ to: '/settings' })
        }
      }),
      registry.register({
        id: 'safety.filters',
        title: 'Content filters & safety',
        run: () => {
          setPreviewIntent()
          void navigate({ to: '/settings' })
        }
      }),
      // The Desk (0273): a per-identity home canvas. "Go to Desk" creates it
      // on first visit (deterministic id + createIfMissing); "Pin to Desk"
      // queues the active tab's node, drained next time the Desk is visible.
      registry.register({
        id: 'workbench.openDesk',
        title: 'Go to Desk',
        key: 'g k',
        when: () => didRef.current != null,
        run: () => {
          const did = didRef.current
          if (did) navigateToNode(navigate, 'canvas', deskIdFor(did))
        }
      }),
      registry.register({
        id: 'workbench.pinToDesk',
        title: 'Pin to Desk',
        when: () => {
          const tab = selectActiveTab(useWorkbench.getState())
          return didRef.current != null && tab != null && isExplorerNodeType(tab.nodeType)
        },
        run: () => {
          const state = useWorkbench.getState()
          const tab = selectActiveTab(state)
          if (!tab || !isExplorerNodeType(tab.nodeType)) return
          state.queueDeskPin({
            nodeId: tab.nodeId,
            schemaId: SCHEMA_IDS[tab.nodeType],
            title: tab.title || 'Untitled'
          })
        }
      }),
      registry.register({
        id: 'help.shortcuts',
        title: 'Keyboard shortcuts',
        key: '?',
        run: () => setHelpOpen((open) => !open)
      })
    ]

    return () => {
      for (const disposable of disposables) disposable.dispose()
      uninstall()
    }
  }, [navigate])

  if (!helpOpen) return null

  const registry = getCommandRegistry()
  const commands = registry.getAllCommands().filter((command) => command.key)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={() => setHelpOpen(false)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
          Keyboard shortcuts
        </div>
        <ul className="max-h-96 list-none overflow-y-auto p-2">
          {commands.map((command) => (
            <li
              key={command.id}
              className="flex items-center justify-between px-3 py-1.5 text-sm text-foreground"
            >
              <span>{command.title}</span>
              <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                {registry.formatForDisplay(command.key ?? '')}
              </kbd>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-5 py-2 text-center text-xs text-muted-foreground">
          Press <kbd className="rounded border border-border bg-secondary px-1 py-0.5">?</kbd> or{' '}
          <kbd className="rounded border border-border bg-secondary px-1 py-0.5">Esc</kbd> to close
        </div>
      </div>
    </div>
  )
}
