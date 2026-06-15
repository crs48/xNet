/**
 * Create a new document already filed into a Space (exploration 0181 follow-up).
 *
 * The doc views create their node lazily via `useNode(..., { createIfMissing })`,
 * so to file a new doc into a Space we eager-create the node *with* its `space`
 * set (using the same trivial title default the view would use) and then
 * navigate — the view then loads the existing node instead of creating a
 * space-less one. Only page/database/canvas have a trivial default safe to
 * pre-create; lab/dashboard set up richer state in their own `createIfMissing`,
 * so when a Space is active they are created normally and can be filed
 * afterwards via "Move to Space…".
 */
import { useNavigate } from '@tanstack/react-router'
import { CanvasSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { useMutate } from '@xnetjs/react'
import { useCallback } from 'react'
import { DOC_TYPE_ROUTES, newDocId, type CreatableDocType } from '../lib/doc-creation'

export function useCreateInSpace(): (
  type: CreatableDocType,
  spaceId: string | null
) => Promise<void> {
  const { create } = useMutate()
  const navigate = useNavigate()

  return useCallback(
    async (type, spaceId) => {
      const route = DOC_TYPE_ROUTES[type]
      const id = newDocId()
      const go = () => navigate({ to: route.to, params: { [route.paramKey]: id } } as never)

      if (spaceId) {
        if (type === 'page') {
          await create(PageSchema, { title: 'Untitled', space: spaceId }, id)
        } else if (type === 'database') {
          await create(DatabaseSchema, { title: 'Untitled Database', space: spaceId }, id)
        } else if (type === 'canvas') {
          await create(CanvasSchema, { title: 'Untitled Canvas', space: spaceId }, id)
        }
        // lab/dashboard: not eager-filed (richer createIfMissing) — Move to Space… instead.
      }

      go()
    },
    [create, navigate]
  )
}
