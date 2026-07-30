/**
 * apps/web — writes a just-completed ATProto link onto the canonical profile
 * (0322/0338). The login-door ceremony runs before the xNet identity exists
 * and the app remounts on completion, so the linked handle is stashed in
 * session storage; this component (mounted in the authenticated tree) drains
 * the stash exactly once and pre-fills `atprotoDid`/`atprotoHandle` on the
 * `profile-<did>` node. Renders nothing.
 */
import { ProfileSchema, profileNodeId } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useEffect, useRef } from 'react'
import { clearPendingAtprotoLink, readPendingAtprotoLink } from './atproto-ceremony'

export function AtprotoProfileLinker(): null {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const did = authorDID ?? ''
  const { data: profiles } = useQuery(ProfileSchema, {
    where: { did: did as `did:key:${string}` }
  })
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !bridge || !did) return
    const pending = readPendingAtprotoLink()
    if (!pending) return

    const canonicalId = profileNodeId(did)
    const nodes = (profiles ?? []) as unknown as Array<Record<string, unknown>>
    const existing = nodes.find((p) => String(p.id) === canonicalId)
    // Wait for the query to resolve the canonical node (or confirm absence)
    // before writing, so we update rather than race a duplicate create.
    if (profiles === undefined) return

    done.current = true
    const fields = {
      atprotoDid: pending.atprotoDid,
      atprotoHandle: pending.atprotoHandle,
      ...(pending.displayName ? { displayName: pending.displayName } : {})
    }
    const write = existing
      ? bridge.update(canonicalId, fields)
      : bridge.create(
          ProfileSchema,
          {
            did: did as `did:key:${string}`,
            displayName: pending.displayName ?? pending.atprotoHandle,
            atprotoDid: pending.atprotoDid,
            atprotoHandle: pending.atprotoHandle
          },
          canonicalId
        )
    void Promise.resolve(write).finally(() => clearPendingAtprotoLink())
  }, [bridge, did, profiles])

  return null
}
