/**
 * useNewActions — the one Space-aware "New" action set (exploration 0288).
 *
 * Every "New" entry point (the top-island New button, the mobile New sheet)
 * routes through this hook so they never diverge: the same creatable types, the
 * same "file into the active Space vs unfiled" rule, and the same New-folder /
 * Add-shared verbs. Doc creation reuses {@link useCreateInSpace} (Space filing)
 * / {@link navigateToNewDoc} (unfiled); folder creation is done inline via
 * `useMutate` (so it works outside the Explorer's folders provider).
 *
 * The non-document verbs (0387) are deliberately thin command dispatches: the
 * owning surface knows how to create a channel / Space / task, and QuickCreateHost
 * hosts the naming step at the shell so it works even when that panel isn't
 * mounted. This hook stays a menu model, not a place domain logic accretes.
 */
import { useNavigate } from '@tanstack/react-router'
import { FolderSchema } from '@xnetjs/data'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useMutate } from '@xnetjs/react'
import { CheckSquare2, Hash, Layers, Mic, type LucideIcon } from 'lucide-react'
import { useCallback } from 'react'
import { useCreateInSpace } from '../hooks/useCreateInSpace'
import { useSpaces } from '../hooks/useSpaces'
import { navigateToNewDoc, type CreatableDocType, type NavigateLike } from '../lib/doc-creation'
import { useWorkbench } from './state'
import { isRealSpace } from './views/explorer-scope'

/** Creatable document types offered by the canonical New menu (0288). */
export const NEW_DOC_TYPES: readonly CreatableDocType[] = [
  'page',
  'database',
  'canvas',
  'dashboard',
  'map',
  'lab'
]

/**
 * The non-document things you can create from the canonical New menu (0387),
 * in menu order. Each is a shell command owned by the surface that knows how
 * to make one — see QuickCreateHost.
 */
export const NEW_OTHER_ACTIONS: readonly NewOtherAction[] = [
  { id: 'task', label: 'New task', icon: CheckSquare2, command: 'tasks.new' },
  { id: 'channel', label: 'New channel', icon: Hash, command: 'chats.newChannel' },
  { id: 'meeting', label: 'New meeting', icon: Mic, command: 'meetings.record' },
  { id: 'space', label: 'New space', icon: Layers, command: 'spaces.new' }
]

export interface NewOtherAction {
  id: 'task' | 'channel' | 'meeting' | 'space'
  label: string
  icon: LucideIcon
  /** The shell command that performs it. */
  command: string
}

export interface NewActions {
  /** Creatable doc types, in menu order. */
  types: readonly CreatableDocType[]
  /** Non-document creatables (task, channel, meeting, space), in menu order. */
  otherActions: readonly NewOtherAction[]
  /** Name of the Space new items file into, or null when creating unfiled. */
  targetName: string | null
  /** Create a document of `type`, Space-aware. */
  createDoc: (type: CreatableDocType) => void
  /** Create a new (unfiled) folder; returns its id. */
  createFolder: () => Promise<string | null>
  /** Run one of {@link NEW_OTHER_ACTIONS} by dispatching its command. */
  runOther: (action: NewOtherAction) => void
  /** Open the "Add shared…" dialog (a shell command). */
  addShared: () => void
}

export function useNewActions(): NewActions {
  const navigate = useNavigate()
  const createInSpace = useCreateInSpace()
  const { create } = useMutate()
  const currentSpaceId = useWorkbench((state) => state.currentSpaceId)
  const { getSpace } = useSpaces()

  const filed = isRealSpace(currentSpaceId)
  const targetName = filed ? (getSpace(currentSpaceId)?.name ?? null) : null

  const createDoc = useCallback(
    (type: CreatableDocType) => {
      if (filed) {
        void createInSpace(type, currentSpaceId)
      } else {
        navigateToNewDoc(navigate as unknown as NavigateLike, type)
      }
    },
    [filed, currentSpaceId, createInSpace, navigate]
  )

  const createFolder = useCallback(async () => {
    const folder = await create(FolderSchema, { name: 'New folder' })
    return folder?.id ?? null
  }, [create])

  const addShared = useCallback(() => {
    void getCommandRegistry().runCommand('share.addShared')
  }, [])

  const runOther = useCallback((action: NewOtherAction) => {
    void getCommandRegistry().runCommand(action.command)
  }, [])

  return {
    types: NEW_DOC_TYPES,
    otherActions: NEW_OTHER_ACTIONS,
    targetName,
    createDoc,
    createFolder,
    runOther,
    addShared
  }
}
