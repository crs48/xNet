/**
 * ChatAvatar — a user's avatar with an optional presence dot (0198).
 * Uses the profile image when one is set, else the deterministic DIDAvatar
 * identicon so every author still has a stable visual identity.
 */
import type { PresenceStatus } from '@xnetjs/comms'
import { cn, DIDAvatar } from '@xnetjs/ui'
import { safeAvatarSrc } from './comms-utils'
import { PresenceDot } from './PresenceDot'

export function ChatAvatar({
  did,
  src,
  size = 36,
  status,
  showPresence = false,
  className
}: {
  did: string
  src?: string
  size?: number
  status?: PresenceStatus
  showPresence?: boolean
  className?: string
}) {
  // Presence cards and synced profiles come from remote peers — only render
  // sources safeAvatarSrc trusts; anything else falls back to the identicon.
  const imageSrc = safeAvatarSrc(src)
  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <DIDAvatar did={did} size={size} />
      )}
      {showPresence && <PresenceDot status={status} className="absolute -bottom-0.5 -right-0.5" />}
    </span>
  )
}
