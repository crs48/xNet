import type { MutateOp } from '@xnetjs/react'
import { SavedViewSchema } from '@xnetjs/data'
import { createDefaultSocialWorkspaceSavedViewSeeds } from '@xnetjs/social/workspace'

export type SocialWorkspaceSeedSummary = {
  created: number
  updated: number
  total: number
}

export function getDefaultSocialWorkspaceSeeds() {
  return createDefaultSocialWorkspaceSavedViewSeeds({ pageSize: 100 })
}

export async function upsertDefaultSocialWorkspace(input: {
  mutate: (ops: MutateOp[]) => Promise<unknown>
  getExisting: (id: string) => Promise<unknown>
}): Promise<SocialWorkspaceSeedSummary> {
  const seeds = getDefaultSocialWorkspaceSeeds()
  let created = 0
  let updated = 0
  const operations = await Promise.all(
    seeds.map(async (seed): Promise<MutateOp> => {
      const existing = await input.getExisting(seed.deterministicId)
      if (existing) {
        updated += 1
        return {
          type: 'update',
          id: seed.deterministicId,
          data: seed.savedViewProperties
        }
      }

      created += 1
      return {
        type: 'create',
        id: seed.deterministicId,
        schema: SavedViewSchema,
        data: seed.savedViewProperties
      } as MutateOp
    })
  )

  await input.mutate(operations)

  return {
    created,
    updated,
    total: seeds.length
  }
}
