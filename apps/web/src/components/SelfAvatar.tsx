/**
 * SelfAvatar — the signed-in user's avatar everywhere the shell shows "you":
 * the profile picture when one is set, else the deterministic DID identicon
 * every peer gets by default.
 */
import { useIdentity } from '@xnetjs/react'
import { ChatAvatar } from '../comms/ChatAvatar'
import { useCommsMaybe } from '../comms/CommsContext'

export function SelfAvatar({ size = 32, className }: { size?: number; className?: string }) {
  // `did` (not `identity`) so restored-but-locked sessions still get their
  // identicon instead of a gray placeholder.
  const { did } = useIdentity()
  const me = useCommsMaybe()?.me
  if (!did) {
    return (
      <span
        className={`inline-flex shrink-0 rounded-full bg-background-muted ${className ?? ''}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return <ChatAvatar did={did} src={me?.avatar} size={size} className={className} />
}
