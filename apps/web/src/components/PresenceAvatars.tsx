/**
 * PresenceAvatars - Shows active editors as overlapping circular avatars
 */

import type { PresenceUser } from '@xnetjs/react'
import { DIDAvatar } from '@xnetjs/ui'

interface PresenceAvatarsProps {
  presence: PresenceUser[]
  localDid?: string | null
}

export function PresenceAvatars({ presence }: PresenceAvatarsProps) {
  if (presence.length === 0) return null

  return (
    <div className="flex items-center -space-x-1.5 px-1">
      {presence.map((user) => (
        <div key={user.did} className="relative" title={`Peer: ${user.did.slice(0, 20)}...`}>
          <div className="rounded-full ring-2 ring-background" style={{ width: 22, height: 22 }}>
            <DIDAvatar did={user.did} size={22} />
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
