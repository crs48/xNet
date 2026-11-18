import { useState } from 'react'
import { api, errorText, type Room } from './api'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'

export type RoomCopy = { latest_only: boolean; messages: number }
export type PostStorage = {
  follows: string[]
  follow_names: Record<string, string>
  budget_mb: number
  community_bytes: number
  community_posts: number
  followed_posts: number
  sync_error: string | null
}

export function RoomStorage({
  room,
  copy,
  update
}: {
  room: Room
  copy?: RoomCopy
  update: () => Promise<unknown>
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const bounded = copy?.latest_only ?? false
  return (
    <details className="rounded-md border p-2 text-sm">
      <summary>On this device · {bounded ? 'Latest 500' : 'All history'}</summary>
      <p>
        {(copy?.messages ?? 0).toLocaleString()} {copy?.messages === 1 ? 'message' : 'messages'}{' '}
        saved. Your desktop catches up directly from available room members.
      </p>
      {!room.private && (
        <>
          <p>
            {bounded
              ? 'Older messages can return if another member still has them.'
              : 'Keeping the latest 500 removes older messages from this device. If this was the last copy, those messages can’t be recovered.'}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                await api({ op: 'room_retention', id: room.id, latest_only: !bounded })
                await update()
              } catch (e) {
                setError(errorText(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            {bounded ? 'Keep all available history' : 'Keep only the latest 500'}
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  )
}

export function PostContribution({
  state,
  update
}: {
  state: PostStorage
  update: () => Promise<unknown>
}) {
  const [mb, setMb] = useState(String(state.budget_mb))
  const [notice, setNotice] = useState('')
  return (
    <section className="settings" aria-label="Public post storage">
      <h2 className="subheading">Public posts on this device</h2>
      <p>
        Your own posts stay here. Following someone keeps a copy of their public posts and replies,
        even if they don’t follow you back.
      </p>
      <p>
        {state.followed_posts.toLocaleString()} followed{' '}
        {state.followed_posts === 1 ? 'post' : 'posts'} · {state.follows.length}{' '}
        {state.follows.length === 1 ? 'author' : 'authors'}
      </p>
      {state.follows.length > 0 && (
        <details>
          <summary>Manage followed authors</summary>
          <ul>
            {state.follows.map((id) => (
              <li key={id}>
                {state.follow_names[id] || 'Author'} · <code>{id.slice(0, 8)}</code>{' '}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await api({ op: 'follow_posts', author: id, follow: false })
                      await update()
                      setNotice('Unfollowed. Copies from this author were released.')
                    } catch (e) {
                      setNotice(errorText(e))
                    }
                  }}
                >
                  Unfollow
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await api({ op: 'post_budget', mb: Number(mb) })
            await update()
            setNotice('Storage limit saved.')
          } catch (e) {
            setNotice(errorText(e))
          }
        }}
      >
        <label>
          Extra space for other people’s public posts (MB)
          <Input
            type="number"
            min="0"
            max="100000"
            required
            value={mb}
            onChange={(e) => setMb(e.target.value)}
          />
        </label>
        <p className="small muted">
          The tracker suggests posts with few online copies. Set 0 to stop donating and remove those
          copies. Your follows and chats are separate. This limit counts post data, excluding
          database overhead.
        </p>
        <p>
          {state.community_posts.toLocaleString()} community copies ·{' '}
          {state.community_bytes.toLocaleString()} bytes of {state.budget_mb.toLocaleString()} MB
        </p>
        <Button variant="outline">Save post limit</Button>
        {notice && <p role="status">{notice}</p>}
      </form>
      {state.sync_error && <p role="status">Public post sync is waiting: {state.sync_error}</p>}
    </section>
  )
}
