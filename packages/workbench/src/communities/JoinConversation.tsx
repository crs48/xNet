import { ChannelSchema } from '@xnetjs/data'
import { channelShareRoom, useQuery, useXNet } from '@xnetjs/react'
import { useEffect, useState } from 'react'
import { Modal, inputClass, primaryButton } from './primitives'

/** A reference never grants access; the configured host must authorize the subscription. */
export function JoinConversation({
  onClose,
  onOpen
}: {
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const { syncManager } = useXNet()
  const [value, setValue] = useState('')
  const [requested, setRequested] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { data: channels } = useQuery(ChannelSchema, { limit: 500 })
  const found = channels.some((channel) => channel.id === requested)
  useEffect(() => {
    if (!requested || !syncManager) return
    const room = channelShareRoom(requested)
    syncManager.subscribeShareRoom(room)
    const timeout = setTimeout(() => {
      setError(
        'The conversation has not arrived. Check that you use the same host and that its owner has granted you access.'
      )
      setRequested(null)
    }, 15000)
    return () => {
      clearTimeout(timeout)
      syncManager.unsubscribeShareRoom(room)
    }
  }, [requested, syncManager])
  useEffect(() => {
    if (found && requested) {
      onOpen(requested)
      onClose()
    }
  }, [found, requested, onOpen, onClose])
  return (
    <Modal title="Open a shared conversation" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          const id = value.trim()
          setError('')
          if (!/^(chat-|dm-)[a-zA-Z0-9-]{8,100}$/.test(id)) {
            setError('Paste the complete conversation ID copied from its details.')
            return
          }
          if (!syncManager || syncManager.status !== 'connected') {
            setError('Connect to the community’s host in settings first.')
            return
          }
          setRequested(id)
        }}
      >
        <p className="text-sm leading-6 text-muted-foreground">
          Ask a member for the conversation ID and connect to the same community host. The ID does
          not grant permission: private conversations still require an invitation.
        </p>
        <label className="block space-y-2 text-sm">
          Conversation ID
          <input
            required
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={inputClass}
            placeholder="chat-… or dm-…"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button disabled={!!requested} className={`${primaryButton} w-full`}>
          {requested ? 'Waiting for the conversation…' : 'Open conversation'}
        </button>
      </form>
    </Modal>
  )
}
