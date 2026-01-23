/**
 * PresenceAvatars - Shows active editors as overlapping circular avatars
 */

import React from 'react'
import { DIDAvatar } from '@xnet/ui'
import type { RemoteUser } from '@xnet/react'

interface PresenceAvatarsProps {
  remoteUsers: RemoteUser[]
  localDid?: string | null
}

export function PresenceAvatars({ remoteUsers, localDid }: PresenceAvatarsProps) {
  if (remoteUsers.length === 0) return null

  return (
    <div className="flex items-center -space-x-2">
      {remoteUsers.map((user) => (
        <div key={user.clientId} className="relative" title={`Peer: ${user.did.slice(0, 20)}...`}>
          <div className="rounded-full ring-2 ring-background" style={{ width: 28, height: 28 }}>
            <DIDAvatar did={user.did} size={28} />
          </div>
          {/* Online indicator dot */}
          <div
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background"
            style={{ backgroundColor: user.color }}
          />
        </div>
      ))}
    </div>
  )
}
