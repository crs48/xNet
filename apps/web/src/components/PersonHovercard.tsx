/**
 * PersonHovercard — the click target for an @mention chip (exploration 0172).
 *
 * Resolves "where does an @mention go?" the way Slack/GitHub do: a popover is
 * the fast path (avatar, status, one-click DM), with the full per-person
 * dashboard one click behind it. The popover preserves reading context — you
 * can DM or open the profile without leaving the thread you're in.
 */
import { useNavigate } from '@tanstack/react-router'
import { ensureDmChannel } from '@xnetjs/comms'
import { useDataBridge } from '@xnetjs/react/internal'
import { DIDAvatar, Popover } from '@xnetjs/ui'
import { MessageCircle, UserRound } from 'lucide-react'
import { useCallback, type ReactElement } from 'react'
import { displayName } from '../comms/comms-utils'
import { useComms } from '../comms/CommsContext'
import { useProfiles } from '../comms/hooks'
import { navigateToNode } from '../workbench/navigation'

/** The popover body: identity + the two actions. */
function PersonCard({ did }: { did: string }) {
  const navigate = useNavigate()
  const bridge = useDataBridge()
  const profiles = useProfiles()
  const { me } = useComms()
  const isSelf = did === me.did
  const name = displayName(did, profiles)

  const message = useCallback(async () => {
    if (!bridge || isSelf) return
    const { channelId } = await ensureDmChannel(bridge, [me.did, did])
    navigateToNode(navigate, 'channel', channelId)
  }, [bridge, isSelf, me.did, did, navigate])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <DIDAvatar did={did} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink-1">{name}</div>
          <div className="truncate font-mono text-[10px] text-ink-3" title={did}>
            {did}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        {!isSelf && (
          <button
            type="button"
            onClick={() => void message()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2"
          >
            <MessageCircle size={13} strokeWidth={1.5} />
            Message
          </button>
        )}
        <button
          type="button"
          onClick={() => navigateToNode(navigate, 'person', did)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2"
        >
          <UserRound size={13} strokeWidth={1.5} />
          {isSelf ? 'Open your profile' : 'Open profile'}
        </button>
      </div>
    </div>
  )
}

/**
 * An @mention chip that opens the person popover on click. `label` overrides
 * the resolved display name (e.g. the composer-captured label).
 */
export function PersonMentionChip({ did, label }: { did: string; label?: string }) {
  const profiles = useProfiles()
  const name = label ?? displayName(did, profiles)
  const trigger: ReactElement = (
    <button
      type="button"
      className="cursor-pointer rounded-full border border-hairline bg-transparent px-1.5 py-px text-[10px] text-ink-2 transition-colors hover:text-ink-1"
    >
      @{name}
    </button>
  )
  return (
    <Popover trigger={trigger} side="top" align="start">
      <PersonCard did={did} />
    </Popover>
  )
}
