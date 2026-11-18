import type { PeerContact, GroupAccess } from './peer-contract'
import { Popover, PopoverTitle } from '@xnetjs/ui'
import { ChevronDown, CircleAlert, Lock, Radio, Server } from 'lucide-react'

export function ConnectionBadge({
  peer
}: {
  peer?: Pick<PeerContact, 'status' | 'connection' | 'queued' | 'deliveredAt' | 'error'> & {
    hosting?: boolean
    access?: GroupAccess
  }
}) {
  const label = peer?.error
    ? 'Needs attention'
    : peer?.queued
      ? 'Waiting to deliver'
      : peer?.hosting
        ? 'Hosted by you'
        : peer?.status === 'blocked'
          ? 'Disconnected'
          : peer?.connection === 'direct'
            ? 'Direct connection'
            : peer?.connection === 'relay'
              ? 'Via relay'
              : 'Waiting for peer'
  const Icon = peer?.error
    ? CircleAlert
    : peer?.hosting
      ? Server
      : peer?.connection === 'direct'
        ? Radio
        : Lock
  return (
    <>
      <Popover
        className="community-popover !w-72"
        align="end"
        trigger={
          <button
            className="chat-button-secondary inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[11px] text-muted-foreground"
            aria-label={`Connection details: ${label}`}
          >
            <Icon size={12} aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
            <ChevronDown size={11} aria-hidden="true" />
          </button>
        }
      >
        <PopoverTitle>{label}</PopoverTitle>
        <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
          <p>
            {peer?.access === 'public'
              ? 'This group has public history.'
              : 'Messages travel over an encrypted peer connection.'}
          </p>
          <p>
            {peer?.hosting
              ? 'Keep xNet open to deliver messages to this group.'
              : 'Your messages are saved locally. Both devices, and the group host, need to be reachable for delivery.'}
          </p>
          {peer?.queued && <p>Some messages are waiting to be delivered.</p>}
          {peer?.deliveredAt && (
            <p>Last confirmed delivery: {new Date(peer.deliveredAt).toLocaleString()}.</p>
          )}
          {peer?.error && <p className="text-foreground">{peer.error}</p>}
          <p className="border-t border-border pt-2">
            Peer chats currently support text and Markdown. Files and calls aren’t available over
            this connection yet.
          </p>
        </div>
      </Popover>
      <span className="sr-only" role="status">
        {label}
      </span>
    </>
  )
}
