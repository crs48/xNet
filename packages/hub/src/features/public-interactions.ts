/**
 * @xnetjs/hub - Public-interaction policy surface (explorations 0378/0383 W2).
 *
 * The read half of 0378's interaction layer: given a node whose effective
 * visibility is `public`, what may a stranger do to it? The author's
 * `PublicInteractionPolicy` node answers per surface (comment/reply/reaction/
 * quote/…); this feature resolves it server-side so any client — including the
 * anonymous index surface — can render the right affordances without guessing.
 *
 * Resolution is O(1): the policy node lives at the deterministic id
 * `publicInteractionPolicyId(targetId)` (the `spaceMembershipId` convention),
 * so no reverse property index is needed. A missing policy resolves to the
 * schema's defaults — `authenticated` for the common surfaces, exactly what
 * `PublicInteractionPolicySchema` declares.
 *
 * Born as a feature module (0383 W2's migration list starts here): mount-only
 * plus `services`, no loops, no tables — the write-enforcement seam (gating a
 * stranger's Comment push on `commentMode`) lands in the node-relay when the
 * community role's write surface ships.
 */

import type { HubStorage } from '../storage/interface'
import type { HubFeature } from './types'
import { publicInteractionPolicyId, PublicInteractionPolicySchema } from '@xnetjs/data'
import { resolveEffectiveVisibility } from '../routes/public'

/** The per-surface modes exposed to clients. */
export interface ResolvedInteractionPolicy {
  nodeId: string
  visibility: 'public' | 'unlisted' | 'private'
  /** Whether an explicit policy node was found (false = schema defaults). */
  explicit: boolean
  modes: Record<string, string>
}

/** Schema-declared default mode per surface (single source: the schema). */
const defaultModes = (): Record<string, string> => {
  const modes: Record<string, string> = {}
  for (const prop of PublicInteractionPolicySchema.schema.properties) {
    if (prop.name.endsWith('Mode')) {
      const fallback = (prop.config as { default?: string } | undefined)?.default
      if (fallback) modes[prop.name] = fallback
    }
  }
  return modes
}

export class PublicInteractionService {
  constructor(private storage: HubStorage) {}

  async resolve(nodeId: string): Promise<ResolvedInteractionPolicy> {
    const visibility = await resolveEffectiveVisibility(this.storage, nodeId)
    const modes = defaultModes()
    const policyMeta = await this.storage.getDocMeta(publicInteractionPolicyId(nodeId))
    const props = policyMeta?.properties
    let explicit = false
    if (props) {
      explicit = true
      for (const key of Object.keys(modes)) {
        const value = props[key]
        if (typeof value === 'string') modes[key] = value
      }
    }
    return { nodeId, visibility, explicit, modes }
  }
}

/**
 * `GET /public/interactions/:nodeId` — resolved interaction policy for a
 * PUBLIC node. Non-public nodes 404 exactly like `routes/public.ts`
 * (`NOT_PUBLIC`), so this surface leaks nothing the public read surface
 * doesn't already.
 */
export function publicInteractionsFeature(storage: HubStorage): HubFeature {
  let service: PublicInteractionService

  return {
    id: 'fyi.xnet.hub.public-interactions',
    services: () => {
      service = new PublicInteractionService(storage)
      return { service }
    },
    mount: ({ app }) => {
      app.get('/public/interactions/:nodeId', async (c) => {
        const nodeId = c.req.param('nodeId')
        const resolved = await service.resolve(nodeId)
        if (resolved.visibility !== 'public') {
          return c.json({ error: 'NOT_PUBLIC' }, 404)
        }
        return c.json(resolved)
      })
    }
  }
}
