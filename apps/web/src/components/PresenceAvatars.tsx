/**
 * PresenceAvatars - Shows active editors as overlapping circular avatars.
 * Peers resolve through synced Profile nodes (fetched by DID when missing),
 * so collaborators from shared contexts get their real name + picture; the
 * DID identicon remains the fallback.
 */

import type { PresenceUser } from '@xnetjs/react'
import { useMemo } from 'react'
import { ChatAvatar } from '../comms/ChatAvatar'
import { displayName, useEnsureProfiles, useProfiles } from '../comms/hooks'

interface PresenceAvatarsProps {
  presence: PresenceUser[]
  localDid?: string | null
}

export function PresenceAvatars({ presence }: PresenceAvatarsProps) {
  const dids = useMemo(() => presence.map((user) => user.did), [presence])
  useEnsureProfiles(dids)
  const profiles = useProfiles()
  if (presence.length === 0) return null

  return (
    <div className="flex items-center -space-x-1.5 px-1">
      {presence.map((user) => (
        <div key={user.did} className="relative" title={displayName(user.did, profiles)}>
          <div className="rounded-full ring-2 ring-background" style={{ width: 22, height: 22 }}>
            <ChatAvatar
              did={user.did}
              src={profiles.find((p) => p.did === user.did)?.avatar}
              size={22}
            />
          </div>
          {/* Online indicator dot */}
          <div
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-background"
            style={{ backgroundColor: user.color }}
          />
        </div>
      ))}
    </div>
  )
}
