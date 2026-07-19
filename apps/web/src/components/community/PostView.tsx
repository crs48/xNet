/**
 * PostView — a single community topic (0359).
 *
 * A Post carries a Y.Doc exactly like a Page, so the body is the same
 * BlockNote surface (`Editor`) rather than a second, lesser composer. The
 * header adds the two editorial levers a host has — pin and lock — both
 * explicit human acts, never computed from engagement.
 *
 * Replies are `Comment` nodes targeting this Post (see `PostSchema` docs), so
 * they arrive through the existing universal comment surface.
 */
import { PostSchema, canManageSpace } from '@xnetjs/data'
import { useIdentity, useNode } from '@xnetjs/react'
import { Lock, Pin } from 'lucide-react'
import { useSpaceMembers } from '../../hooks/useSpaces'
import { Editor as EditorComponent } from '../Editor'

export function PostView({ postId }: { postId: string }): JSX.Element {
  const { identity, did: selfDid } = useIdentity()
  const did = identity?.did

  const {
    data: post,
    doc,
    update,
    loading,
    error,
    awareness
  } = useNode(PostSchema, postId, { did: did ?? undefined })

  const { members } = useSpaceMembers((post?.space as string) ?? null)
  const viewerRole = members.find((m) => m.member === (did ?? selfDid))?.role
  const isAdmin = viewerRole ? canManageSpace(viewerRole) : false

  if (loading) return <div className="p-6 muted">Loading…</div>
  if (error || !post) return <div className="p-6 muted">This topic could not be loaded.</div>

  return (
    <div className="post-view p-6">
      <header className="post-header">
        <input
          className="post-title"
          value={(post.title as string | undefined) ?? ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled topic"
          aria-label="Topic title"
        />
        {isAdmin && (
          <div className="post-actions">
            <button
              type="button"
              aria-pressed={post.pinned === true}
              onClick={() => update({ pinned: !post.pinned })}
              title={post.pinned ? 'Unpin this topic' : 'Pin this topic'}
            >
              <Pin size={14} aria-hidden /> {post.pinned ? 'Pinned' : 'Pin'}
            </button>
            <button
              type="button"
              aria-pressed={post.locked === true}
              onClick={() => update({ locked: !post.locked })}
              title={post.locked ? 'Unlock replies' : 'Lock replies'}
            >
              <Lock size={14} aria-hidden /> {post.locked ? 'Locked' : 'Lock'}
            </button>
          </div>
        )}
      </header>

      {doc && (
        <EditorComponent
          className="page-prose mt-3 flex-1"
          doc={doc}
          awareness={awareness}
          did={did}
          pageId={postId}
        />
      )}
    </div>
  )
}
