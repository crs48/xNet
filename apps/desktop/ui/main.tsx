import { AppDialog } from './components/app-dialog'
import { Button } from './components/ui/button'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
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
  RefreshCw,
  Shield
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

import {
  api,
  errorText,
  type RecordData,
  type Signed,
  type Item,
  type Room,
  type Message,
  type Preferences
} from './api'
import { Input } from './components/ui/input'
import { Textarea } from './components/ui/textarea'
import { DesktopUpdates } from './DesktopUpdates'
import {
  ContentControls,
  ReportDialog,
  SafetyCenter,
  RoomManager,
  type ReportTarget
} from './Moderation'
import { PublicFeed } from './PublicFeed'

type Settings = { enabled: boolean; storage_mb: number; upload_mb: number }
import { PostContribution, RoomStorage, type PostStorage, type RoomCopy } from './LocalStorage'
type Snapshot = {
  post_storage: PostStorage
  room_copies: Record<string, RoomCopy>
  id: string
  profile: { name: string } | null
  participation: Settings
  counters: { uploaded: number; downloaded: number; stored: number }
  active: boolean
  reason: string
  registry: string
  preferences: Preferences
  hosting: string[]
  departed_rooms: Room[]
  rooms: Room[]
  library: Signed<RecordData>[]
}
type HistoryCursor = { before: number; source: string }
type HistoryPage = {
  source: string
  earlier: number | null
  revision: string
  offline_until: number | null
  unchanged: boolean
  messages: Message[]
}
type Playback = { url: string; item: Item; privateLink?: string }
const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [tab, setTab] = useState<'discover' | 'music' | 'posts' | 'chats' | 'hosting' | 'safety'>(
    'discover'
  )
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [manageRoom, setManageRoom] = useState<Room | null>(null)
  const [safetyRevision, setSafetyRevision] = useState(0)
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
  const [historyCursors, setHistoryCursors] = useState<HistoryCursor[]>([])
  const [earlier, setEarlier] = useState<HistoryCursor | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const pageCursor = historyCursors.at(-1)
  const [syncError, setSyncError] = useState('')
  const [draft, setDraft] = useState('')
  const [share, setShare] = useState('')
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState('')
  const [audience, setAudience] = useState('')
  const [privateRoom, setPrivateRoom] = useState(true)
  const [link, setLink] = useState('')
  const [storage, setStorage] = useState(1024)
  const [upload, setUpload] = useState(1024)
  const messageEnd = useRef<HTMLDivElement>(null)
  const openModal = (next: 'publish' | 'room' | 'join') => {
    setStatus('')
    setModal(next)
  }
  useEffect(() => {
    if (!isTauri()) return
    let mounted = true
    let unsubscribe: (() => void) | undefined
    const receive = (urls: string[]) => {
      if (!mounted) return
      const prefix = 'xnet-community://open/#'
      const url = urls.find((value) => value.startsWith(prefix) && value.length < 20000)
      if (!url) return
      try {
        const target = new URL(decodeURIComponent(url.slice(prefix.length)))
        if (!['http:', 'https:'].includes(target.protocol)) throw Error()
        setLink(target.href)
        setStatus('')
        setModal('join')
      } catch {
        setStatus('This invitation link could not be read.')
      }
    }
    void (async () => {
      const off = await onOpenUrl(receive)
      if (!mounted) {
        off()
        return
      }
      unsubscribe = off
      receive((await getCurrent()) ?? [])
    })().catch(() => {
      if (mounted) setStatus('Paste a shared link using Open a link.')
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])
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
  const safetyChanged = () => {
    setSafetyRevision((v) => v + 1)
    setPlayback(null)
    void refresh().catch((e) => setStatus(errorText(e)))
    if (tab === 'discover' || tab === 'music')
      void search().catch((e) => {
        setItems([])
        setStatus(errorText(e))
      })
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
    setEarlier(null)
    setSyncError('')
    setHistoryLoading(Boolean(roomId))
    if (!roomId || tab !== 'chats') return
    if (!snapshot?.active) {
      let live = true
      api<Message[]>({ op: 'safety_history', room: roomId })
        .then((data) => {
          if (live) {
            setMessages(data)
            setHistoryLoading(false)
            setSyncError('Saved messages for safety review. Live chat is paused.')
          }
        })
        .catch((e) => {
          if (live) {
            setSyncError(errorText(e))
            setHistoryLoading(false)
          }
        })
      return () => {
        live = false
      }
    }
    let live = true
    let pending = false
    let revision: string | null = null
    const sync = () => {
      if (!live || pending) return
      pending = true
      api<HistoryPage>({
        op: 'history_page',
        id: roomId,
        before: pageCursor?.before,
        source: pageCursor?.source,
        known: revision
      })
        .then((data) => {
          if (live) {
            if (!data.unchanged) setMessages(data.messages)
            revision = data.revision
            setEarlier(data.earlier === null ? null : { before: data.earlier, source: data.source })
            setHistoryLoading(false)
            setSyncError(
              data.offline_until ? 'Reading from a room member while the owner is offline.' : ''
            )
          }
        })
        .catch((e) => {
          if (live) {
            revision = null
            setMessages([])
            setEarlier(null)
            setHistoryLoading(false)
            setSyncError(errorText(e))
          }
        })
        .finally(() => {
          pending = false
        })
    }
    sync()
    const timer = setInterval(sync, 3000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [roomId, pageCursor, tab, snapshot?.active, safetyRevision])
  useEffect(() => {
    if (!pageCursor) messageEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, pageCursor])
  const settings = (enabled: boolean): Settings => ({
    enabled,
    storage_mb: storage,
    upload_mb: upload
  })
  const openRoom = (room: Room) => {
    setTab('chats')
    setStatus('')
    setHistoryCursors([])
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
    setAudience('')
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
        <p className="eyebrow">Community network · early beta</p>
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
            <Input
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
              beta. I can pause or adjust these limits.
            </span>
          </label>
          <p className="small muted">
            Peers may see your network address. Pausing hosting also pauses network playback and
            messaging. No social account is required.
          </p>
          <Button
            variant="default"
            className="w-full"
            disabled={!consent || !name.trim() || !!busy}
          >
            {busy || 'Create account & join the network'}
            <ArrowUpRight size={16} />
          </Button>
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
    <div
      className="shell"
      onClickCapture={(event) => {
        // WebKit leaves pointer-activated buttons unfocused. Keep the dialog’s return target.
        if (event.target instanceof Element) {
          event.target
            .closest<HTMLElement>('button[aria-haspopup="dialog"]')
            ?.focus({ preventScroll: true })
        }
      }}
    >
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
              { key: 'hosting', label: 'Your contribution', icon: HardDrive },
              { key: 'safety', label: 'Safety & moderation', icon: Shield }
            ] as const
          ).map((n) => (
            <Button
              variant="ghost"
              size="sm"
              key={n.key}
              aria-current={tab === n.key ? 'page' : undefined}
              className={`nav-item w-full justify-start gap-2.5 ${tab === n.key ? 'selected' : ''}`}
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
            </Button>
          ))}
        </nav>
        <div className="section-label">
          <span>Your conversations</span>
          <Button
            aria-haspopup="dialog"
            aria-label="New conversation"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setTitle('')
              setPrivateRoom(true)
              openModal('room')
            }}
          >
            <Plus size={15} />
          </Button>
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
              <Button
                variant="ghost"
                size="sm"
                key={r.id}
                className={`room-link w-full justify-start gap-2.5 ${r.id === roomId && tab === 'chats' ? 'selected' : ''}`}
                onClick={() => openRoom(r)}
              >
                {r.private ? <Lock size={14} /> : <Radio size={14} />}
                <span>{r.title}</span>
              </Button>
            ))
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          className="nav-item w-full justify-start gap-2.5"
          onClick={() => {
            setLink('')
            openModal('join')
          }}
        >
          <Link size={16} />
          Open a link
        </Button>
        <DesktopUpdates />
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
                      : tab === 'safety'
                        ? 'Safety & moderation'
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
                      : tab === 'safety'
                        ? 'Your controls, reports, and appeals.'
                        : room
                          ? room.private
                            ? 'Private · invitation only'
                            : 'Public · discoverable in the registry'
                          : 'A place to make things together.'}
            </p>
          </div>
          <div className="actions">
            {tab === 'discover' || tab === 'music' ? (
              <Button
                type="button"
                aria-haspopup="dialog"
                variant="default"
                onClick={publishModal}
                disabled={!snapshot.active}
              >
                <Plus size={16} />
                {tab === 'music' ? 'Share music' : 'Share something'}
              </Button>
            ) : tab === 'chats' ? (
              <Button
                type="button"
                aria-haspopup="dialog"
                variant="outline"
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
            <span>
              {snapshot.reason}. Resume hosting to listen, watch, publish, and chat. Safety controls
              remain available.
            </span>
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
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss update"
              onClick={() => setStatus('')}
            >
              <X size={14} />
            </Button>
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
              <Input
                className="border-0 shadow-none focus-visible:ring-0"
                aria-label="Search community"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  tab === 'music'
                    ? 'Find a track, a mix, a sound…'
                    : 'Find a film, an image, a conversation…'
                }
              />
              <Button aria-label="Search" variant="ghost" size="icon-sm">
                <ArrowUpRight size={17} />
              </Button>
            </form>
            <div className="section-heading">
              <h2>Recently shared</h2>
              <Button
                type="button"
                variant="outline"
                aria-label="Refresh registry"
                title="Refresh registry"
                onClick={() => run('Refreshing…', search)}
              >
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
                <Button
                  type="button"
                  aria-haspopup="dialog"
                  variant="outline"
                  onClick={publishModal}
                  disabled={!snapshot.active}
                >
                  {tab === 'music' ? 'Share music' : 'Share something'}
                </Button>
              </div>
            ) : (
              <div className="cards">
                {items.map((item) => {
                  const r = item.record.payload
                  return (
                    <article className="media-tile" key={r.id}>
                      <button
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
                              {item.providers.length}{' '}
                              {item.providers.length === 1 ? 'host' : 'hosts'}
                            </span>
                          </div>
                        </div>
                      </button>
                      <ContentControls
                        id={r.id}
                        author={item.record.author}
                        name={r.title}
                        onReport={() => setReportTarget({ item })}
                        changed={safetyChanged}
                      />
                    </article>
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
            key={safetyRevision}
            storage={{ id: snapshot.id, follows: snapshot.post_storage.follows, update: refresh }}
            onReport={(item) => setReportTarget({ item })}
            changed={safetyChanged}
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
                <Button
                  type="button"
                  aria-haspopup="dialog"
                  variant="outline"
                  onClick={() => setManageRoom(room)}
                >
                  <Shield size={14} />
                  Room settings
                </Button>
                <span>
                  {room.private ? <Lock size={14} /> : <Users size={14} />}History from room peers
                </span>
                <Button
                  type="button"
                  aria-haspopup="dialog"
                  variant="outline"
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
              <RoomStorage
                key={room.id}
                room={room}
                copy={snapshot.room_copies[room.id]}
                update={refresh}
              />
              {snapshot.active && (earlier || pageCursor) && (
                <nav aria-label="Chat history" className="flex justify-center gap-2 pb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!earlier}
                    onClick={() => {
                      if (earlier) setHistoryCursors((pages) => [...pages, earlier])
                    }}
                  >
                    Earlier messages
                  </Button>
                  {pageCursor && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryCursors((pages) => pages.slice(0, -1))}
                    >
                      Newer messages
                    </Button>
                  )}
                  {historyCursors.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => setHistoryCursors([])}>
                      Latest
                    </Button>
                  )}
                </nav>
              )}
              {historyLoading && (
                <p className="notice" role="status">
                  Checking for shared history…
                </p>
              )}
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
                {!messages.length && !syncError && !historyLoading && (
                  <div className="empty">
                    <MessageCircle size={28} />
                    <h2>
                      {pageCursor || earlier
                        ? 'No visible messages on this page.'
                        : 'No shared messages yet.'}
                    </h2>
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
                    <ContentControls
                      id={m.payload.id}
                      author={m.author}
                      name={`message from ${m.payload.name}`}
                      onReport={() => setReportTarget({ message: m, room, messages })}
                      changed={safetyChanged}
                    />
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
                    setHistoryCursors([])
                    setSafetyRevision((revision) => revision + 1)
                  })
                }}
              >
                <Textarea
                  className="resize-none border-0 shadow-none focus-visible:ring-0"
                  aria-label="Message"
                  placeholder={`Message ${room.title}…`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={4000}
                  disabled={!snapshot.active || !room.members.includes(snapshot.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (draft.trim() && !busy) e.currentTarget.form?.requestSubmit()
                    }
                  }}
                />
                <div>
                  <span>Enter to send · Shift + Enter for a new line</span>
                  <Button
                    variant="default"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label="Send message"
                    disabled={
                      !draft.trim() ||
                      !!busy ||
                      !snapshot.active ||
                      !room.members.includes(snapshot.id)
                    }
                  >
                    <ArrowUp size={17} />
                  </Button>
                </div>
              </form>
              <p className="footnote">
                {room.private
                  ? 'Private to admitted members. Prototype group protocol; no forward secrecy or offline mailbox yet.'
                  : 'Public conversation. The owner must be online to accept new messages.'}
              </p>
            </div>
          ) : (
            <div className="empty">
              <MessageCircle size={32} />
              <h2>Good things start with a conversation.</h2>
              <p>Create a private group, open an invitation, or discover a public room.</p>
              <div className="actions">
                <Button
                  type="button"
                  aria-haspopup="dialog"
                  variant="default"
                  onClick={() => {
                    setTitle('')
                    openModal('room')
                  }}
                >
                  Start a conversation
                </Button>
                <Button
                  type="button"
                  aria-haspopup="dialog"
                  variant="outline"
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
                <span>Media stored here</span>
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
                <Input
                  type="number"
                  value={storage}
                  min={1}
                  max={100000}
                  onChange={(e) => setStorage(Number(e.target.value))}
                />
              </label>
              <label>
                Peer upload budget (MB)
                <Input
                  type="number"
                  value={upload}
                  min={1}
                  max={1000000}
                  onChange={(e) => setUpload(Number(e.target.value))}
                />
              </label>
              <p className="small muted">
                This beta counts a persistent total, not a monthly allowance. Publishing or choosing
                “Keep a full copy” approves hosting for that file. Watching alone does not. No
                background startup or automatic mobile hosting.
              </p>
              <div className="actions">
                <Button variant="outline" disabled={!!busy}>
                  Save limits
                </Button>
                <Button
                  type="button"
                  variant="default"
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
            <PostContribution state={snapshot.post_storage} update={refresh} />
            <h2 className="subheading">Your local library</h2>
            {snapshot.library.length === 0 ? (
              <p className="muted">Published and downloaded media appears here.</p>
            ) : (
              snapshot.library.map((record) => (
                <div className="library-row" key={record.payload.id}>
                  {record.payload.kind === 'audio' ? <Music2 size={18} /> : <Film size={18} />}
                  <span>
                    {record.payload.title}
                    <small>
                      {size(record.payload.size)} ·{' '}
                      {snapshot.hosting.includes(record.payload.id)
                        ? 'Approved for sharing'
                        : 'Stored only'}
                    </small>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      run('Updating file hosting…', async () => {
                        await api({
                          op: 'hosting',
                          id: record.payload.id,
                          allowed: !snapshot.hosting.includes(record.payload.id)
                        })
                      })
                    }
                    disabled={
                      !!busy || (!snapshot.active && !snapshot.hosting.includes(record.payload.id))
                    }
                  >
                    {snapshot.hosting.includes(record.payload.id)
                      ? 'Stop sharing'
                      : 'Approve hosting'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Play ${record.payload.title}`}
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
              <summary>Device & beta details</summary>
              <p>
                Identity: <code>{snapshot.id}</code>
              </p>
              <p>
                Media and history travel directly between peers. Small live messages may use a
                relay. Keys and retained data live in this device's profile folder. Social sign-in,
                key recovery and mobile power controls are not implemented yet.
              </p>
            </details>
          </div>
        )}
        {tab === 'safety' && (
          <SafetyCenter
            preferences={snapshot.preferences}
            self={snapshot.id}
            rooms={[...snapshot.rooms, ...snapshot.departed_rooms]}
            changed={safetyChanged}
          />
        )}
        {reportTarget && (
          <ReportDialog
            target={reportTarget}
            close={() => setReportTarget(null)}
            submitted={() => setStatus('Report received. Track it in Safety & moderation.')}
          />
        )}
        {manageRoom && (
          <RoomManager
            initial={manageRoom}
            self={snapshot.id}
            close={() => setManageRoom(null)}
            changed={safetyChanged}
          />
        )}
        {share && (
          <AppDialog
            title={tab === 'chats' ? 'Share an invitation' : 'Share this link'}
            close={() => setShare('')}
            feedback={status}
          >
            <label>
              {tab === 'chats' && room ? room.title : 'Link'}
              <Input
                data-initial-focus
                aria-label="Shareable link"
                readOnly
                value={share}
                onFocus={(event) => event.target.select()}
              />
            </label>
            <div className="flex justify-end">
              <Button variant="default" type="button" onClick={() => void copy(share)}>
                <Link /> Copy link
              </Button>
            </div>
          </AppDialog>
        )}
      </main>
      {playback && (
        <aside className="preview">
          <div className="preview-head">
            <span>
              {playback.item.record.payload.kind === 'audio' ? 'Now listening' : 'Now viewing'}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close preview"
              onClick={() => setPlayback(null)}
            >
              <X size={18} />
            </Button>
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
              {playback.privateLink
                ? 'Private room file. The seeder checks your device before sending each chunk.'
                : 'Streamed through your local peer and verified before playback.'}
            </p>
            {!playback.privateLink && (
              <Button
                type="button"
                variant="outline"
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
            )}
            <Button
              type="button"
              aria-haspopup="dialog"
              variant="outline"
              onClick={() =>
                copy(
                  playback.privateLink ??
                    `${snapshot.registry}/watch/${playback.item.record.payload.id}`
                )
              }
            >
              <Link size={15} />
              Share link
            </Button>
          </div>
        </aside>
      )}

      {modal === 'publish' && (
        <AppDialog
          feedback={busy || status}
          title={tab === 'music' ? 'Share music' : 'Share something'}
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run('Preparing chunks and publishing metadata…', async () => {
                if (audience) {
                  const { link: privateLink } = await api<{ link: string }>({
                    op: 'share_private',
                    path: file,
                    title,
                    description,
                    room: audience
                  })
                  setModal(null)
                  await copy(privateLink)
                  return
                }
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
              type="button"
              variant="outline"
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
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
              />
            </label>
            <label>
              Description
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
            </label>
            {snapshot.registry.startsWith('https:') && (
              <label>
                Share with
                <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                  <option value="">Everyone</option>
                  {snapshot.rooms
                    .filter((r) => r.private && r.owner.id === snapshot.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} · private room
                      </option>
                    ))}
                </select>
              </label>
            )}
            <p className="small muted">
              {audience
                ? 'Only current members can open this link while your desktop is hosting.'
                : 'Your name, caption and seeding device will appear in the public tracker.'}
            </p>
            <Button
              variant="default"
              className="w-full"
              disabled={!file || !title.trim() || !!busy}
            >
              {audience ? 'Create private link' : 'Publish & host'}
              <ArrowUpRight size={16} />
            </Button>
          </form>
        </AppDialog>
      )}
      {modal === 'room' && (
        <AppDialog
          feedback={busy || status}
          title="A new conversation"
          close={() => setModal(null)}
        >
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
              <Input
                data-initial-focus
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
            <Button
              variant="default"
              className="w-full"
              disabled={!title.trim() || !!busy || !snapshot.active}
            >
              Create conversation
              <ChevronRight size={15} />
            </Button>
          </form>
        </AppDialog>
      )}
      {modal === 'join' && (
        <AppDialog
          feedback={busy || status}
          title="Open a shared link"
          close={() => setModal(null)}
        >
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
                const match = address.pathname.match(/^\/(watch|post|private)\/([a-f0-9]{64})$/)
                if (match?.[1] === 'post') {
                  await api({ op: 'post_thread', id: match[2] })
                  setPostId(match[2])
                  setTab('posts')
                  setPlayback(null)
                  setShare('')
                } else if (match?.[1] === 'watch' || match?.[1] === 'private') {
                  const privateFile = match[1] === 'private'
                  const result = await api<Playback>({
                    op: privateFile ? 'play_private' : 'play',
                    id: match[2]
                  })
                  setPlayback(privateFile ? { ...result, privateLink: address.href } : result)
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
              <Input
                data-initial-focus
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={snapshot.registry + '/…'}
                required
              />
            </label>
            <Button
              variant="default"
              className="w-full"
              disabled={!link.trim() || !!busy || !snapshot.active}
            >
              Open in xNet
              <ArrowUpRight size={16} />
            </Button>
          </form>
        </AppDialog>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
