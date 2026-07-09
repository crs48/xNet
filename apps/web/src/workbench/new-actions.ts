/**
 * useNewActions — the one Space-aware "New" action set (exploration 0288).
 *
 * Every "New" entry point (the top-island New button, the Explorer list, the
 * home view) routes through this hook so they never diverge: the same creatable
 * types, the same "file into the active Space vs unfiled" rule, and the same
 * New-folder / Add-shared verbs. Doc creation reuses {@link useCreateInSpace}
 * (Space filing) / {@link navigateToNewDoc} (unfiled); folder creation is done
 * inline via `useMutate` (so it works outside the Explorer's folders provider);
 * Add-shared is a shell command (see AddSharedHost) reachable from anywhere.
 */
import { useNavigate } from '@tanstack/react-router'
import { FolderSchema } from '@xnetjs/data'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useMutate } from '@xnetjs/react'
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

export interface NewActions {
  /** Creatable doc types, in menu order. */
  types: readonly CreatableDocType[]
  /** Name of the Space new items file into, or null when creating unfiled. */
  targetName: string | null
  /** Create a document of `type`, Space-aware. */
  createDoc: (type: CreatableDocType) => void
  /** Create a new (unfiled) folder; returns its id. */
  createFolder: () => Promise<string | null>
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

  return { types: NEW_DOC_TYPES, targetName, createDoc, createFolder, addShared }
}
