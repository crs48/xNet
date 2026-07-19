/**
 * CommunityFeed — the discussion surface of a community Space (0359).
 *
 * Three panels, in the order a host actually needs them:
 *
 *  1. **Welcome** (admins only) — newcomers whose first post nobody answered,
 *     longest wait first. This is what a community surfaces *instead of*
 *     ranked standing: work to be done, never position. The reasoning and
 *     the evidence live with `welcomeQueue` in `@xnetjs/social`.
 *  2. **Compose** — start a topic. Title here, body in the editor on the
 *     topic page (Post carries a Y.Doc, same as Page).
 *  3. **Topics** — pinned first, then newest. `comparePostsForFeed` is the
 *     only ordering, and it reads no engagement signal (Charter §3).
 */
import { useNavigate } from '@tanstack/react-router'
import { PostSchema, comparePostsForFeed, canManageSpace, type Post } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
// Subpath, not the bare barrel: `@xnetjs/social` re-exports the Node-only
// archive importers, which breaks the browser bundle at build time.
import { markFirstPosts, welcomeQueue } from '@xnetjs/social/community'
import { DIDAvatar } from '@xnetjs/ui'
import { MessageSquare, Pin, Lock as LockIcon, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { displayName as resolveName } from '../../comms/comms-utils'
import { useEnsureProfiles, useProfiles } from '../../comms/hooks'
import { useSpaceMembers } from '../../hooks/useSpaces'
import { navigateToNode } from '../../workbench/navigation'

interface CommunityFeedProps {
  spaceId: string
  /** The viewer's DID, for the admin check and authorship. */
  viewerDid: string | null
}

/** Replies live on Comment (see PostSchema docs); counted by the caller. */
const replyCountFor = (_postId: string, counts: Record<string, number>): number =>
  counts[_postId] ?? 0

export function CommunityFeed({ spaceId, viewerDid }: CommunityFeedProps): JSX.Element {
  const navigate = useNavigate()
  const { create } = useMutate()
  const { data: posts } = useQuery(PostSchema, { where: { space: spaceId } })
  const { members } = useSpaceMembers(spaceId)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const rows = useMemo<Post[]>(
    () => [...((posts ?? []) as Post[])].sort(comparePostsForFeed),
    [posts]
  )

  const authorDids = useMemo(
    () => [...new Set(rows.map((p) => p.createdBy as string | undefined))],
    [rows]
  )
  useEnsureProfiles(authorDids)
  const profiles = useProfiles()

  const viewerRole = members.find((m) => m.member === viewerDid)?.role
  const isAdmin = viewerRole ? canManageSpace(viewerRole) : false

  // Reply counts come from the Comment index; until a topic has replies the
  // map is simply empty, which is exactly the unanswered case.
  const replyCounts = useMemo<Record<string, number>>(() => ({}), [])

  const welcome = useMemo(() => {
    if (!isAdmin) return []
    const candidates = markFirstPosts(
      rows.map((p) => ({
        postId: p.id,
        authorDid: (p.createdBy ?? '') as string,
        createdAt: p.createdAt ?? 0,
        replyCount: replyCountFor(p.id, replyCounts)
      }))
    )
    return welcomeQueue(candidates, Date.now())
  }, [rows, replyCounts, isAdmin])

  const startTopic = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const id = crypto.randomUUID()
      await create(PostSchema, { title: trimmed, space: spaceId }, id)
      setTitle('')
      navigateToNode(navigate, 'post', id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="community-feed">
      {isAdmin && welcome.length > 0 && (
        <section className="community-welcome" aria-label="Newcomers waiting for a reply">
          <h3>
            <Sparkles size={14} aria-hidden /> Say hello
          </h3>
          <p className="muted">
            {welcome.length === 1
              ? 'Someone posted for the first time and nobody has replied yet.'
              : `${welcome.length} people posted for the first time and nobody has replied yet.`}
          </p>
          <ul>
            {welcome.map((entry) => (
              <li key={entry.postId}>
                <button
                  type="button"
                  onClick={() => navigateToNode(navigate, 'post', entry.postId)}
                >
                  <DIDAvatar did={entry.authorDid} size={20} />
                  <span>{resolveName(entry.authorDid, profiles)}</span>
                  <time className="muted">waiting {formatWait(entry.waitingMs)}</time>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="community-compose">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void startTopic()
          }}
          placeholder="Start a topic…"
          aria-label="Topic title"
        />
        <button type="button" onClick={() => void startTopic()} disabled={!title.trim() || busy}>
          Post
        </button>
      </section>

      <section className="community-topics">
        {rows.length === 0 ? (
          <p className="muted">No topics yet. Start the first one.</p>
        ) : (
          <ul>
            {rows.map((post) => (
              <li key={post.id}>
                <button type="button" onClick={() => navigateToNode(navigate, 'post', post.id)}>
                  {post.pinned && <Pin size={12} aria-label="Pinned" />}
                  {post.locked && <LockIcon size={12} aria-label="Locked" />}
                  <span className="community-topic-title">{post.title}</span>
                  <span className="muted">
                    <DIDAvatar did={(post.createdBy ?? '') as string} size={16} />
                    {resolveName((post.createdBy ?? '') as string, profiles)}
                  </span>
                  <MessageSquare size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Coarse, humane wait formatting — hours and days, never a ticking counter. */
function formatWait(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'less than an hour'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
