import { ArrowLeft, ArrowUp, Globe2, Link, MessageCircle, RefreshCw, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, errorText, type Item } from './api'

type Thread = { post: Item; replies: Item[] }

function Post({
  item,
  open,
  share
}: {
  item: Item
  open: (id: string) => void
  share: (id: string) => void
}) {
  const r = item.record.payload
  return (
    <article className="post-card">
      <div className="avatar" aria-hidden="true">
        {r.owner_name.slice(0, 1).toUpperCase()}
      </div>
      <div className="post-content">
        <div className="post-author">
          <strong title={`Device identity: ${item.record.author}`}>{r.owner_name}</strong>
          <time dateTime={new Date(r.created * 1000).toISOString()}>
            {new Date(r.created * 1000).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </time>
        </div>
        {r.reply_to && (
          <button className="parent-link" onClick={() => open(r.reply_to!)}>
            Replying to a post
          </button>
        )}
        <p className="post-body">{r.description}</p>
        <div className="post-actions">
          <button onClick={() => open(r.id)} aria-label={`Replies to ${r.owner_name}'s post`}>
            <MessageCircle size={15} /> Reply & discuss
          </button>
          <button onClick={() => share(r.id)} aria-label={`Share ${r.owner_name}'s post`}>
            <Link size={15} /> Share
          </button>
        </div>
      </div>
    </article>
  )
}

function Composer({
  name,
  active,
  parent,
  published
}: {
  name: string
  active: boolean
  parent: string | null
  published: () => void
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const count = [...body.trim()].length
  return (
    <form
      className="post-composer"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!active || busy || count === 0 || count > 280) return
        setBusy(true)
        setError('')
        try {
          await api({ op: 'publish_post', body, reply_to: parent })
          setBody('')
          published()
        } catch (e) {
          setError(errorText(e))
        } finally {
          setBusy(false)
        }
      }}
    >
      <label htmlFor="public-draft">
        {parent ? 'Add to the conversation' : `What’s on your mind, ${name}?`}
      </label>
      <textarea
        id="public-draft"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={busy || !active}
        placeholder={
          parent ? 'A thoughtful reply…' : 'An idea, a little update, something worth sharing…'
        }
        aria-describedby="post-visibility post-length"
        aria-invalid={count > 280}
      />
      <div className="post-compose-footer">
        <span id="post-visibility">
          <Globe2 size={13} /> Public · anyone can read
        </span>
        <span id="post-length" className={count > 280 ? 'over-limit' : ''}>
          {count}/280
        </span>
        <button className="button primary" disabled={!active || busy || count === 0 || count > 280}>
          <ArrowUp size={14} />
          {busy ? 'Publishing…' : parent ? 'Reply' : 'Post'}
        </button>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

export function PublicFeed({
  name,
  active,
  selected,
  select,
  share
}: {
  name: string
  active: boolean
  selected: string | null
  select: (id: string | null) => void
  share: (id: string) => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [thread, setThread] = useState<Thread | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const refresh = () => setRevision((v) => v + 1)
  useEffect(() => {
    heading.current?.focus()
  }, [selected])
  useEffect(() => {
    setThread(null)
    setItems([])
    setConfirmation('')
  }, [selected, search])
  useEffect(() => {
    if (!active) {
      setLoading(false)
      return
    }
    let live = true
    let pending = false
    const load = async (initial: boolean) => {
      if (pending) return
      pending = true
      if (initial) setLoading(true)
      try {
        if (selected) {
          const result = await api<Thread>({ op: 'post_thread', id: selected })
          if (live) setThread({ ...result, replies: [...result.replies].reverse() })
        } else {
          const result = await api<Item[]>({ op: 'catalog', query: search, kind: 'post' })
          if (live) setItems(result)
        }
        if (live) setError('')
      } catch (e) {
        if (live) setError(errorText(e))
      } finally {
        pending = false
        if (live) setLoading(false)
      }
    }
    void load(true)
    const timer = setInterval(() => void load(false), 10000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [active, selected, search, revision])
  return (
    <div className="content public-feed">
      <div className="feed-heading">
        {selected && (
          <button
            className="icon-button"
            aria-label="Back to public feed"
            onClick={() => select(null)}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <h2 ref={heading} tabIndex={-1}>
          {selected ? 'Conversation' : 'The public square'}
        </h2>
        <button
          className="icon-button"
          aria-label="Refresh posts"
          onClick={refresh}
          disabled={!active || loading}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {!selected && (
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(query)
            refresh()
          }}
        >
          <Search size={16} />
          <input
            aria-label="Search public posts"
            placeholder="Search ideas and conversations…"
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="icon-button" aria-label="Search posts">
            <ArrowUp size={16} />
          </button>
        </form>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}{' '}
          <button className="button" onClick={refresh}>
            Try again
          </button>
        </p>
      )}
      {confirmation && (
        <p className="small muted" role="status">
          {confirmation}
        </p>
      )}
      {loading && (
        <p className="small muted" role="status">
          Loading posts…
        </p>
      )}
      {selected && thread && <Post item={thread.post} open={select} share={share} />}
      {(!selected || thread) && (
        <Composer
          key={selected || 'feed'}
          name={name}
          active={active}
          parent={selected}
          published={() => {
            setConfirmation(selected ? 'Reply published.' : 'Post published.')
            refresh()
          }}
        />
      )}
      <div aria-label={selected ? 'Public replies' : 'Recent public posts'} aria-busy={loading}>
        {(selected ? thread?.replies || [] : items).map((item) => (
          <Post key={item.record.payload.id} item={item} open={select} share={share} />
        ))}
      </div>
      {!loading &&
        !error &&
        active &&
        (selected ? thread && thread.replies.length === 0 : items.length === 0) && (
          <div className="empty feed-empty">
            <MessageCircle size={26} />
            <h2>
              {selected
                ? 'Start the conversation.'
                : search
                  ? 'No posts match yet.'
                  : 'A thought can start something.'}
            </h2>
            <p>
              {selected
                ? 'Leave a kind reply or a question.'
                : 'Share ideas, find your people, and keep the conversation going.'}
            </p>
          </div>
        )}
      <p className="footnote">
        {selected ? 'Up to 100 latest replies, oldest first' : 'Up to 100 posts, newest first'} ·
        updates every 10 seconds.
        <br />
        Public text and names are stored in this registry. Posts cannot be edited or deleted in this
        prototype. For private conversations, use Chats.
      </p>
    </div>
  )
}
