import type { MutateOp } from '@xnetjs/react'
import { SavedViewSchema } from '@xnetjs/data'
import { createDefaultSocialWorkspaceSavedViewSeeds } from '@xnetjs/social/workspace'

export type SocialWorkspaceSeedSummary = {
  created: number
  updated: number
  total: number
}

type SocialWorkspaceSeedOperationResult = {
  action: 'created' | 'updated'
  operation: MutateOp
}

export function getDefaultSocialWorkspaceSeeds() {
  return createDefaultSocialWorkspaceSavedViewSeeds({ pageSize: 100 })
}

export async function upsertDefaultSocialWorkspace(input: {
  mutate: (ops: MutateOp[]) => Promise<unknown>
  getExisting: (id: string) => Promise<unknown>
}): Promise<SocialWorkspaceSeedSummary> {
  const seeds = getDefaultSocialWorkspaceSeeds()
  const operationResults = await Promise.all(
    seeds.map(async (seed): Promise<SocialWorkspaceSeedOperationResult> => {
      const existing = await input.getExisting(seed.deterministicId)
      if (existing) {
        return {
          action: 'updated',
          operation: {
            type: 'update',
            id: seed.deterministicId,
            data: seed.savedViewProperties
          }
        }
      }

      return {
        action: 'created',
        operation: {
          type: 'create',
          id: seed.deterministicId,
          schema: SavedViewSchema,
          data: seed.savedViewProperties
        } as MutateOp
      }
    })
  )

  const operations = operationResults.map((result) => result.operation)
  await input.mutate(operations)

  return {
    created: operationResults.filter((result) => result.action === 'created').length,
    updated: operationResults.filter((result) => result.action === 'updated').length,
    total: seeds.length
  }
}
