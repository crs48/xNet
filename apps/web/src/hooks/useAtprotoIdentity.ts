/**
 * apps/web — the signed-in user's linked AT Protocol identity (0420).
 *
 * The DID lives on the Profile node, written by the login-door ceremony. Two
 * surfaces now need it (publishing, and comparing affinity), so the lookup —
 * canonical deterministic node first, legacy random-id node as a fallback —
 * lives here rather than being copied a third time.
 *
 * Returns `null` rather than an empty string when there is no link: "not
 * linked" and "linked to nothing" must not be the same value at a call site
 * that is about to write to a repo.
 */
import { ProfileSchema, profileNodeId } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'

export interface AtprotoIdentity {
  did: string
  handle?: string
}

export function useAtprotoIdentity(): AtprotoIdentity | null {
  const { authorDID } = useXNet()
  const did = authorDID ?? ''
  const { data: profiles } = useQuery(ProfileSchema, {
    where: { did: did as `did:key:${string}` }
  })

  if (!did) return null
  const canonicalId = profileNodeId(did)
  const nodes = (profiles ?? []) as unknown as Array<Record<string, unknown>>
  const profile = nodes.find((p) => String(p.id) === canonicalId) ?? nodes[0]

  const atprotoDid = profile?.atprotoDid
  if (typeof atprotoDid !== 'string' || atprotoDid === '') return null
  return {
    did: atprotoDid,
    handle: typeof profile?.atprotoHandle === 'string' ? profile.atprotoHandle : undefined
  }
}
