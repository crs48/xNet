import { invoke } from '@tauri-apps/api/core'
import {
  Film,
  Music2,
  MessagesSquare,
  MessageCircle,
  HardDrive,
  Plus,
  Search,
  ArrowUpRight,
  ArrowUp,
  X,
  Link,
  Pause,
  Play,
  Image,
  Users,
  Lock,
  Radio,
  ChevronRight,
  Download,
  RefreshCw
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

import { api, errorText, type RecordData, type Signed, type Item } from './api'
import { PublicFeed } from './PublicFeed'

type Room = {
  id: string
  title: string
  private: boolean
  owner: { id: string }
  members: string[]
}
type Message = Signed<{ id: string; room: string; name: string; body: string; created: number }>
type Settings = { enabled: boolean; storage_mb: number; upload_mb: number }
type Snapshot = {
  id: string
  profile: { name: string } | null
  participation: Settings
  counters: { uploaded: number; downloaded: number; stored: number }
  active: boolean
  reason: string
  registry: string
  rooms: Room[]
  library: Signed<RecordData>[]
}
type Playback = { url: string; item: Item }
const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

function Button({
  children,
  onClick,
  disabled = false,
  primary = false,
  title
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  primary?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`button ${primary ? 'primary' : ''}`}
    >
      {children}
    </button>
  )
}
function Modal({
  title,
  children,
  close,
  feedback
}: {
  title: string
  children: ReactNode
  close: () => void
  feedback?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    ref.current?.showModal()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])
  return (
    <dialog ref={ref} onCancel={close} aria-labelledby="dialog-title">
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
      {feedback && (
        <p role="status" className="notice dialog-feedback">
          {feedback}
        </p>
      )}
    </dialog>
  )
}
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [tab, setTab] = useState<'discover' | 'music' | 'posts' | 'chats' | 'hosting'>('discover')
  const [postId, setPostId] = useState<string | null>(null)
  const catalogRequest = useRef(0)
  const [items, setItems] = useState<Item[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState('')
  const [modal, setModal] = useState<'publish' | 'room' | 'join' | null>(null)
  const [playback, setPlayback] = useState<Playback | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [syncError, setSyncError] = useState('')
  const [draft, setDraft] = useState('')
  const [share, setShare] = useState('')
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState('')
  const [privateRoom, setPrivateRoom] = useState(true)
  const [link, setLink] = useState('')
  const [storage, setStorage] = useState(1024)
  const [upload, setUpload] = useState(1024)
  const messageEnd = useRef<HTMLDivElement>(null)
  const openModal = (next: 'publish' | 'room' | 'join') => {
    setStatus('')
    setModal(next)
  }
  const refresh = async () => {
    const state = await api<Snapshot>({ op: 'snapshot' })
    setSnapshot(state)
    return state
  }
  const search = async () => {
    const request = ++catalogRequest.current
    const result = await api<Item[]>({
      op: 'catalog',
      query,
      kind: tab === 'music' ? 'audio' : 'visual'
    })
    if (request === catalogRequest.current) setItems(result)
  }
  async function run(label: string, work: () => Promise<void>) {
    setBusy(label)
    setStatus('')
    try {
      await work()
      await refresh()
    } catch (e) {
      setStatus(errorText(e))
    } finally {
      setBusy('')
    }
  }
  useEffect(() => {
    refresh()
      .then((state) => {
        setStorage(state.participation.storage_mb)
        setUpload(state.participation.upload_mb)
      })
      .catch((e) => setStatus(errorText(e)))
    const timer = setInterval(() => refresh().catch((e) => setStatus(errorText(e))), 2500)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const request = ++catalogRequest.current
    setItems([])
    setQuery('')
    if (tab !== 'discover' && tab !== 'music') return
    api<Item[]>({ op: 'catalog', query: '', kind: tab === 'music' ? 'audio' : 'visual' })
      .then((result) => {
        if (request === catalogRequest.current) setItems(result)
      })
      .catch((e) => {
        if (request === catalogRequest.current) setStatus(errorText(e))
      })
    return () => {
      catalogRequest.current++
    }
  }, [tab])
  const room = snapshot?.rooms.find((r) => r.id === roomId)
  useEffect(() => {
    setMessages([])
    setSyncError('')
    if (!roomId || !snapshot?.active) return
    let live = true
    let pending = false
    const sync = () => {
      if (!live || pending) return
      pending = true
      api<Message[]>({ op: 'messages', id: roomId })
        .then((data) => {
          if (live) {
            setMessages(data)
            setSyncError('')
          }
        })
        .catch((e) => {
          if (live) setSyncError(errorText(e))
        })
        .finally(() => {
          pending = false
        })
    }
    sync()
    const timer = setInterval(sync, 1500)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [roomId, snapshot?.active])
  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])
  const settings = (enabled: boolean): Settings => ({
    enabled,
    storage_mb: storage,
    upload_mb: upload
  })
  const openRoom = (room: Room) => {
    setTab('chats')
    setStatus('')
    setRoomId(room.id)
    setPlayback(null)
    setShare('')
  }
  const openItem = async (item: Item) => {
    if (item.record.payload.kind === 'room') {
      const r = await api<Room>({
        op: 'join',
        link: `${snapshot?.registry}/room/${item.record.payload.id}`
      })
      await refresh()
      openRoom(r)
    } else {
      setPlayback(await api<Playback>({ op: 'play', id: item.record.payload.id }))
      setShare('')
    }
  }
  const copy = async (value: string) => {
    setShare(value)
    try {
      await navigator.clipboard.writeText(value)
      setStatus('Link copied.')
    } catch {
      setStatus('Select and copy the link below.')
    }
  }
  const publishModal = () => {
    setTitle('')
    setDescription('')
    setFile('')
    openModal('publish')
  }
  if (!snapshot)
    return (
      <div className="loading">
        <img src="/wordmark.svg" alt="xNet" width="120" height="46" />
        <p>{status || 'Starting your local peer…'}</p>
      </div>
    )
  if (!snapshot.profile)
    return (
      <main className="onboarding">
        <img src="/wordmark.svg" alt="xNet" />
        <p className="eyebrow">Community network · experiment</p>
        <h1>
          A little internet,
          <br />
          kept alive together.
        </h1>
        <p className="muted">
          Your account lives on this computer. Share films, make things, and talk with people. Every
          participating desktop helps host the network.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run('Creating your account…', async () => {
              await api({ op: 'account', name })
              await api({ op: 'participation', settings: settings(true) })
            })
          }}
        >
          <label>
            Your name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="What should people call you?"
              required
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Enable hosting on this device. Use up to 1 GB storage and 1 GB peer upload in this
              prototype. I can pause or adjust these limits.
            </span>
          </label>
          <p className="small muted">
            Peers may see your network address. Pausing hosting also pauses network playback and
            messaging. No social account is required for this local demo.
          </p>
          <button className="button primary wide" disabled={!consent || !name.trim() || !!busy}>
            {busy || 'Create account & join the network'}
            <ArrowUpRight size={16} />
          </button>
        </form>
        {status && (
          <p role="alert" className="notice">
            {status}
          </p>
        )}
        <p className="small muted">
          Device-key identity · no password or tracking · social sign-in comes later
        </p>
      </main>
    )

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/wordmark.svg" alt="xNet" />
          <span>Community</span>
        </div>
        <nav aria-label="Main navigation">
          {(
            [
              { key: 'discover', label: 'Discover', icon: Film },
              { key: 'music', label: 'Music', icon: Music2 },
              { key: 'posts', label: 'Posts', icon: MessagesSquare },
              { key: 'chats', label: 'Chats', icon: MessageCircle },
              { key: 'hosting', label: 'Your contribution', icon: HardDrive }
            ] as const
          ).map((n) => (
            <button
              key={n.key}
              aria-current={tab === n.key ? 'page' : undefined}
              className={`nav-item ${tab === n.key ? 'selected' : ''}`}
              onClick={() => {
                setTab(n.key)
                setStatus('')
                setPlayback(null)
                setShare('')
              }}
            >
              <n.icon size={17} />
              {n.label}
              {n.key === 'chats' && <span className="count">{snapshot.rooms.length}</span>}
            </button>
          ))}
        </nav>
        <div className="section-label">
          <span>Your conversations</span>
          <button
            aria-label="New conversation"
            className="icon-button"
            onClick={() => {
              setTitle('')
              setPrivateRoom(true)
              openModal('room')
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="room-list">
          {snapshot.rooms.length === 0 ? (
            <p className="small muted empty-label">
              A place for your people.
              <br />
              Start a chat or open an invitation.
            </p>
          ) : (
            snapshot.rooms.map((r) => (
              <button
                key={r.id}
                className={`room-link ${r.id === roomId && tab === 'chats' ? 'selected' : ''}`}
                onClick={() => openRoom(r)}
              >
                {r.private ? <Lock size={14} /> : <Radio size={14} />}
                <span>{r.title}</span>
              </button>
            ))
          )}
        </div>
        <button
          className="nav-item"
          onClick={() => {
            setLink('')
            openModal('join')
          }}
        >
          <Link size={16} />
          Open a link
        </button>
        <div className="profile">
          <div className="avatar">{snapshot.profile.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{snapshot.profile.name}</strong>
            <p>{snapshot.active ? 'Contributing' : 'Hosting paused'}</p>
          </div>
          <span className={`dot ${snapshot.active ? 'active' : ''}`} />
        </div>
      </aside>
      <main className="workspace">
        <header className="toolbar">
          <div>
            <h1>
              {tab === 'discover'
                ? 'Discover'
                : tab === 'music'
                  ? 'Music'
                  : tab === 'posts'
                    ? 'Posts'
                    : tab === 'hosting'
                      ? 'Your contribution'
                      : room?.title || 'Chats'}
            </h1>
            <p>
              {tab === 'discover'
                ? 'From this community, in the order it was shared.'
                : tab === 'music'
                  ? 'Sounds worth sharing. Hosted by the people who listen.'
                  : tab === 'posts'
                    ? 'Little updates. Open conversations. A chronological feed.'
                    : tab === 'hosting'
                      ? 'Useful work, within limits you choose.'
                      : room
                        ? room.private
                          ? 'Private · invitation only'
                          : 'Public · discoverable in the registry'
                        : 'A place to make things together.'}
            </p>
          </div>
          <div className="actions">
            {tab === 'discover' || tab === 'music' ? (
              <Button primary onClick={publishModal} disabled={!snapshot.active}>
                <Plus size={16} />
                {tab === 'music' ? 'Share music' : 'Share something'}
              </Button>
            ) : tab === 'chats' ? (
              <Button
                onClick={() => {
                  setTitle('')
                  openModal('room')
                }}
              >
                <Plus size={16} />
                New conversation
              </Button>
            ) : null}
          </div>
        </header>
        {!snapshot.active && (
          <div className="participation-banner">
            <Pause size={16} />
            <span>{snapshot.reason}. Resume hosting to listen, watch, publish, and chat.</span>
            <button onClick={() => setTab('hosting')}>
              Manage hosting
              <ChevronRight size={15} />
            </button>
          </div>
        )}
        {(status || busy) && (
          <div className={`notice top ${busy ? 'working' : ''}`} role={busy ? 'status' : 'alert'}>
            {busy && <span className="spinner" />}
            {busy || status}
            <button
              className="icon-button"
              aria-label="Dismiss update"
              onClick={() => setStatus('')}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {(tab === 'discover' || tab === 'music') && (
          <div className="content">
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault()
                run('Searching this registry…', search)
              }}
            >
              <Search size={17} />
              <input
                aria-label="Search community"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  tab === 'music'
                    ? 'Find a track, a mix, a sound…'
                    : 'Find a film, an image, a conversation…'
                }
              />
              <button aria-label="Search" className="icon-button">
                <ArrowUpRight size={17} />
              </button>
            </form>
            <div className="section-heading">
              <h2>Recently shared</h2>
              <Button title="Refresh registry" onClick={() => run('Refreshing…', search)}>
                <RefreshCw size={14} />
              </Button>
            </div>
            {items.length === 0 ? (
              <div className="empty">
                {tab === 'music' ? <Music2 size={30} /> : <Film size={30} />}
                <h2>The first thing can be yours.</h2>
                <p>
                  {tab === 'music'
                    ? 'Share a track you made, a jam, or a sound you love. MP3 and WAV, up to 100 MB.'
                    : 'Share a short film or an image.'}{' '}
                  Your desktop serves the file; this registry stores the details.
                </p>
                <Button onClick={publishModal} disabled={!snapshot.active}>
                  {tab === 'music' ? 'Share music' : 'Share something'}
                </Button>
              </div>
            ) : (
              <div className="cards">
                {items.map((item) => {
                  const r = item.record.payload
                  return (
                    <button
                      key={r.id}
                      className="media-card"
                      onClick={() => run('Connecting to a peer…', () => openItem(item))}
                      disabled={!snapshot.active}
                    >
                      <div className="media-placeholder">
                        {r.kind === 'room' ? (
                          <MessageCircle size={28} />
                        ) : r.kind === 'audio' ? (
                          <Music2 size={28} />
                        ) : r.kind === 'image' ? (
                          <Image size={28} />
                        ) : (
                          <Play size={28} />
                        )}
                        <span>
                          {r.kind === 'room'
                            ? 'Public conversation'
                            : r.mime === 'audio/mpeg'
                              ? 'MP3'
                              : r.mime.split('/')[1].toUpperCase()}
                        </span>
                      </div>
                      <div className="card-body">
                        <h3>{r.title}</h3>
                        <p>{r.description || 'Shared with this community.'}</p>
                        <div className="card-footer">
                          <span>{r.owner_name}</span>
                          <span>
                            {item.providers.length} {item.providers.length === 1 ? 'host' : 'hosts'}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="footnote">
              Public metadata only · {snapshot.registry} · up to 100 results · hosts may go offline
            </p>
          </div>
        )}

        {tab === 'posts' && (
          <PublicFeed
            name={snapshot.profile.name}
            active={snapshot.active}
            selected={postId}
            select={setPostId}
            share={(id) => void copy(`${snapshot.registry}/post/${id}`)}
          />
        )}

        {tab === 'chats' &&
          (room ? (
            <div className="chat">
              <div className="chat-context">
                <span>
                  {room.private ? <Lock size={14} /> : <Users size={14} />}Authenticated peer
                  transport · latest 200 messages
                </span>
                <Button
                  onClick={() =>
                    run('Making your invitation…', async () => {
                      const result = await api<{ link: string }>({ op: 'invite', id: room.id })
                      await copy(result.link)
                    })
                  }
                  disabled={room.owner.id !== snapshot.id}
                >
                  <Link size={14} />
                  Invite
                </Button>
              </div>
              {syncError && (
                <p className="notice" role="status">
                  {syncError}
                </p>
              )}
              <div
                className="messages"
                role="log"
                aria-label="Conversation messages"
                aria-live="polite"
              >
                {!messages.length && (
                  <div className="empty">
                    <MessageCircle size={28} />
                    <h2>Start with a hello.</h2>
                    <p>
                      {room.private
                        ? 'Only invited peer identities can join this room.'
                        : 'Anyone with a participating desktop can join this public room.'}
                    </p>
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.payload.id}
                    className={`message ${m.author === snapshot.id ? 'mine' : ''}`}
                  >
                    <div className="avatar small-avatar">
                      {m.payload.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="message-author">
                        {m.payload.name}
                        <time>
                          {new Date(m.payload.created * 1000).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </time>
                      </div>
                      <p>{m.payload.body}</p>
                    </div>
                  </div>
                ))}
                <div ref={messageEnd} />
              </div>
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault()
                  run('Sending to the room owner…', async () => {
                    await api({ op: 'send', id: room.id, body: draft })
                    setDraft('')
                    setMessages(await api<Message[]>({ op: 'messages', id: room.id }))
                  })
                }}
              >
                <textarea
                  aria-label="Message"
                  placeholder={`Message ${room.title}…`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={4000}
                  disabled={!snapshot.active}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (draft.trim() && !busy) e.currentTarget.form?.requestSubmit()
                    }
                  }}
                />
                <div>
                  <span>Enter to send · Shift + Enter for a new line</span>
                  <button
                    className="send"
                    aria-label="Send message"
                    disabled={!draft.trim() || !!busy || !snapshot.active}
                  >
                    <ArrowUp size={17} />
                  </button>
                </div>
              </form>
              <p className="footnote">
                {room.private
                  ? 'Private to admitted members. Prototype group protocol; no forward secrecy or offline mailbox yet.'
                  : 'Public conversation. The room owner must be online for synchronization.'}
              </p>
            </div>
          ) : (
            <div className="empty">
              <MessageCircle size={32} />
              <h2>Good things start with a conversation.</h2>
              <p>Create a private group, open an invitation, or discover a public room.</p>
              <div className="actions">
                <Button
                  primary
                  onClick={() => {
                    setTitle('')
                    openModal('room')
                  }}
                >
                  Start a conversation
                </Button>
                <Button
                  onClick={() => {
                    setLink('')
                    openModal('join')
                  }}
                >
                  Open an invitation
                </Button>
              </div>
            </div>
          ))}

        {tab === 'hosting' && (
          <div className="content narrow">
            <div className="hosting-status">
              <HardDrive size={24} />
              <div>
                <h2>
                  {snapshot.active ? 'Your desktop is participating.' : 'Your desktop is paused.'}
                </h2>
                <p className="muted">
                  Hosting is required to use this network. You remain in control of your computer.
                </p>
              </div>
            </div>
            <div className="metrics">
              <div>
                <span>Stored here</span>
                <strong>{size(snapshot.counters.stored)}</strong>
              </div>
              <div>
                <span>Sent to peers</span>
                <strong>{size(snapshot.counters.uploaded)}</strong>
              </div>
              <div>
                <span>Received from peers</span>
                <strong>{size(snapshot.counters.downloaded)}</strong>
              </div>
            </div>
            <form
              className="settings"
              onSubmit={(e) => {
                e.preventDefault()
                run('Saving contribution limits…', async () => {
                  await api({
                    op: 'participation',
                    settings: settings(snapshot.participation.enabled)
                  })
                  setStatus('Limits saved.')
                })
              }}
            >
              <label>
                Storage limit (MB)
                <input
                  type="number"
                  value={storage}
                  min={1}
                  max={100000}
                  onChange={(e) => setStorage(Number(e.target.value))}
                />
              </label>
              <label>
                Peer upload budget (MB)
                <input
                  type="number"
                  value={upload}
                  min={1}
                  max={1000000}
                  onChange={(e) => setUpload(Number(e.target.value))}
                />
              </label>
              <p className="small muted">
                This prototype counts a persistent total, not a monthly allowance. Cached public
                files can be served while hosting is enabled. No background startup or automatic
                mobile hosting.
              </p>
              <div className="actions">
                <button className="button" disabled={!!busy}>
                  Save limits
                </button>
                <Button
                  primary
                  onClick={() =>
                    run('Updating hosting…', async () => {
                      await api({
                        op: 'participation',
                        settings: settings(!snapshot.participation.enabled)
                      })
                    })
                  }
                >
                  {snapshot.participation.enabled ? <Pause size={15} /> : <Play size={15} />}{' '}
                  {snapshot.participation.enabled ? 'Pause hosting' : 'Resume hosting'}
                </Button>
              </div>
            </form>
            <h2 className="subheading">Your local library</h2>
            {snapshot.library.length === 0 ? (
              <p className="muted">Published and downloaded media appears here.</p>
            ) : (
              snapshot.library.map((record) => (
                <div className="library-row" key={record.payload.id}>
                  {record.payload.kind === 'audio' ? <Music2 size={18} /> : <Film size={18} />}
                  <span>
                    {record.payload.title}
                    <small>{size(record.payload.size)}</small>
                  </span>
                  <Button
                    title={`Play ${record.payload.title}`}
                    onClick={() =>
                      run('Opening your copy…', async () => {
                        setPlayback(await api<Playback>({ op: 'play', id: record.payload.id }))
                      })
                    }
                    disabled={!snapshot.active}
                  >
                    <Play size={14} />
                  </Button>
                </div>
              ))
            )}
            <details className="details">
              <summary>Device & prototype details</summary>
              <p>
                Identity: <code>{snapshot.id}</code>
              </p>
              <p>
                Direct Iroh connections; no hosted relay enabled in this local experiment. Keys and
                data stay in this profile's folder with owner-only directory permissions. Social
                sign-in, key recovery, moderation and mobile power controls are not implemented yet.
              </p>
            </details>
          </div>
        )}
        {share && (
          <div className="share-box">
            <label>
              Share this link
              <input
                aria-label="Shareable link"
                readOnly
                value={share}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              className="icon-button"
              aria-label="Close shared link"
              onClick={() => setShare('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </main>
      {playback && (
        <aside className="preview">
          <div className="preview-head">
            <span>
              {playback.item.record.payload.kind === 'audio' ? 'Now listening' : 'Now viewing'}
            </span>
            <button
              className="icon-button"
              aria-label="Close preview"
              onClick={() => setPlayback(null)}
            >
              <X size={18} />
            </button>
          </div>
          {playback.item.record.payload.kind === 'audio' ? (
            <div className="audio-player">
              <Music2 size={56} aria-hidden="true" />
              <audio
                key={playback.url}
                src={playback.url}
                controls
                aria-label={`Play ${playback.item.record.payload.title}`}
                onError={() =>
                  setStatus(
                    'Audio playback failed. Check peer availability, hosting, and the file format.'
                  )
                }
              />
            </div>
          ) : playback.item.record.payload.kind === 'image' ? (
            <img
              className="player"
              src={playback.url}
              alt={playback.item.record.payload.description || playback.item.record.payload.title}
            />
          ) : (
            <video
              className="player"
              src={playback.url}
              controls
              playsInline
              onError={() =>
                setStatus(
                  'Playback failed. The peer may be offline, hosting may be paused, or this system may not support the codec.'
                )
              }
            />
          )}
          <div className="preview-body">
            <p className="eyebrow">{playback.item.record.payload.owner_name}</p>
            <h2>{playback.item.record.payload.title}</h2>
            <p>{playback.item.record.payload.description}</p>
            <p className="small muted">
              Streamed through your local Rust peer. Chunks are verified before playback and cached
              within your storage limit.
            </p>
            <Button
              onClick={() =>
                run('Saving a complete copy and announcing this host…', async () => {
                  await api({ op: 'retain', id: playback.item.record.payload.id })
                  setStatus('Complete copy verified. Your desktop is now listed as a host.')
                  await search()
                })
              }
              disabled={!!busy || !snapshot.active}
            >
              <Download size={15} />
              Keep a full copy
            </Button>
            <Button
              onClick={() => copy(`${snapshot.registry}/watch/${playback.item.record.payload.id}`)}
            >
              <Link size={15} />
              Share link
            </Button>
          </div>
        </aside>
      )}

      {modal === 'publish' && (
        <Modal
          feedback={busy || status}
          title={tab === 'music' ? 'Share music' : 'Share something'}
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run('Preparing chunks and publishing metadata…', async () => {
                await api({ op: 'publish', path: file, title, description })
                setModal(null)
                setStatus(
                  'Published. Your desktop is serving the file; the registry only holds metadata.'
                )
                await search()
              })
            }}
          >
            <p className="muted">
              {tab === 'music'
                ? 'Share an MP3 or WAV you have permission to share.'
                : 'A public image or short film.'}{' '}
              Up to 100 MB. Keep your desktop online so others can find a copy.
            </p>
            <Button
              onClick={() =>
                run('Choosing media…', async () => {
                  const selected = await invoke<string | null>('select_media', {
                    kind: tab === 'music' ? 'audio' : 'visual'
                  })
                  if (selected) {
                    setFile(selected)
                    if (!title)
                      setTitle(
                        selected
                          .split('/')
                          .pop()
                          ?.replace(/\.[^.]+$/, '') || ''
                      )
                  }
                })
              }
            >
              <Plus size={16} />
              {file
                ? file.split('/').pop()
                : tab === 'music'
                  ? 'Choose an audio file'
                  : 'Choose a video or image'}
            </Button>
            <label>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
            </label>
            <p className="small muted">
              Public · your name, caption, file manifest and peer address are discoverable. No
              transcoding is performed.
            </p>
            <button className="button primary wide" disabled={!file || !title.trim() || !!busy}>
              Publish & host
              <ArrowUpRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === 'room' && (
        <Modal feedback={busy || status} title="A new conversation" close={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run('Creating the conversation…', async () => {
                const r = await api<Room>({ op: 'create_room', title, private: privateRoom })
                setModal(null)
                await refresh()
                openRoom(r)
              })
            }}
          >
            <label>
              Name
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                placeholder="Garden club"
                required
              />
            </label>
            <fieldset>
              <legend>Who can join?</legend>
              <label className="check">
                <input
                  type="radio"
                  checked={privateRoom}
                  onChange={() => setPrivateRoom(true)}
                  name="visibility"
                />
                <span>
                  <strong>Private</strong>
                  <small>Only people with an invitation. Not listed in the registry.</small>
                </span>
              </label>
              <label className="check">
                <input
                  type="radio"
                  checked={!privateRoom}
                  onChange={() => setPrivateRoom(false)}
                  name="visibility"
                />
                <span>
                  <strong>Public</strong>
                  <small>Listed in discovery. Any participating peer can join.</small>
                </span>
              </label>
            </fieldset>
            <button
              className="button primary wide"
              disabled={!title.trim() || !!busy || !snapshot.active}
            >
              Create conversation
              <ChevronRight size={15} />
            </button>
          </form>
        </Modal>
      )}
      {modal === 'join' && (
        <Modal feedback={busy || status} title="Open a shared link" close={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run('Resolving your link…', async () => {
                const address = new URL(link.trim())
                if (
                  address.origin !== new URL(snapshot.registry).origin ||
                  address.username ||
                  address.password
                )
                  throw new Error('Open a link from this registry.')
                const match = address.pathname.match(/^\/(watch|post)\/([a-f0-9]{64})$/)
                if (match?.[1] === 'post') {
                  await api({ op: 'post_thread', id: match[2] })
                  setPostId(match[2])
                  setTab('posts')
                  setPlayback(null)
                  setShare('')
                } else if (match?.[1] === 'watch') {
                  const result = await api<Playback>({ op: 'play', id: match[2] })
                  setPlayback(result)
                  setTab(result.item.record.payload.kind === 'audio' ? 'music' : 'discover')
                } else {
                  const r = await api<Room>({ op: 'join', link })
                  await refresh()
                  openRoom(r)
                }
                setModal(null)
              })
            }}
          >
            <p className="muted">
              Paste a music, video, post, or conversation link from this registry.
            </p>
            <label>
              Link
              <input
                autoFocus
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="http://127.0.0.1:4380/…"
                required
              />
            </label>
            <button
              className="button primary wide"
              disabled={!link.trim() || !!busy || !snapshot.active}
            >
              Open in xNet
              <ArrowUpRight size={16} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
