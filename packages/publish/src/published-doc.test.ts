import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { publishPost, type PostRecord } from './pipeline'
import { resolvePublishedDoc, documentEntry } from './published-doc'
import { renderPost } from './render'

const NOW = 1_784_000_000_000

/** A page doc with one paragraph. gc:false, as Yjs snapshots require. */
function pageDoc(text: string): Y.Doc {
  const doc = new Y.Doc({ gc: false })
  const group = new Y.XmlElement('blockGroup')
  doc.getXmlFragment('content-v4').insert(0, [group])
  const container = new Y.XmlElement('blockContainer')
  group.insert(0, [container])
  const content = new Y.XmlElement('paragraph')
  container.insert(0, [content])
  const inline = new Y.XmlText()
  content.insert(0, [inline])
  inline.insert(0, text)
  return doc
}

/** Replace the sole paragraph's text, as an author editing after publish would. */
function editParagraph(doc: Y.Doc, text: string): void {
  const group = doc.getXmlFragment('content-v4').get(0) as Y.XmlElement
  const container = group.get(0) as Y.XmlElement
  const content = container.get(0) as Y.XmlElement
  const inline = content.get(0) as Y.XmlText
  inline.delete(0, inline.length)
  inline.insert(0, text)
}

describe('resolvePublishedDoc', () => {
  it('renders the live document for an unpublished post', async () => {
    const live = pageDoc('draft text')
    const resolved = await resolvePublishedDoc({ id: 'p1', title: 'T' }, live)
    expect(resolved.source).toBe('live')
    expect(resolved.doc).toBe(live)
  })

  it('renders the live document when the post pins no document lane', async () => {
    const live = pageDoc('body')
    const post: PostRecord = {
      id: 'p1',
      title: 'T',
      publishedAt: NOW,
      // Record lane pinned, but no yjsSnapshotRef — nothing to restore.
      publishedFrontier: { p1: { hash: 'h1' } }
    }
    expect(documentEntry(post)).toBeUndefined()
    const resolved = await resolvePublishedDoc(post, live)
    expect(resolved.source).toBe('live')
  })

  it('renders the PINNED snapshot, not the live document — the D2 guarantee', async () => {
    // Publish, then edit. A reader must still see the published words.
    const live = pageDoc('the published words')
    const snapshotAtPublish = pageDoc('the published words')

    const { patch } = publishPost({
      post: { id: 'p1', title: 'Post' },
      takenSlugs: [],
      frontier: { p1: { hash: 'h1', yjsSnapshotRef: 'p1@1000' } },
      now: NOW
    })
    const post: PostRecord = { id: 'p1', title: 'Post', publishedAt: NOW, ...patch }

    editParagraph(live, 'edited after publishing')
    expect(renderPost(live).html).toContain('edited after publishing')

    const resolved = await resolvePublishedDoc(post, live, (ref) =>
      ref === 'p1@1000' ? snapshotAtPublish : null
    )

    expect(resolved.source).toBe('pinned')
    const html = renderPost(resolved.doc).html
    expect(html).toContain('the published words')
    expect(html).not.toContain('edited after publishing')
  })

  it('re-publishing moves the pin so the edit becomes visible', async () => {
    const live = pageDoc('v1')
    const snapshots: Record<string, Y.Doc> = { 'p1@1000': pageDoc('v1') }

    const first = publishPost({
      post: { id: 'p1', title: 'Post' },
      takenSlugs: [],
      frontier: { p1: { hash: 'h1', yjsSnapshotRef: 'p1@1000' } },
      now: NOW
    })
    let post: PostRecord = { id: 'p1', title: 'Post', publishedAt: NOW, ...first.patch }

    editParagraph(live, 'v2')
    snapshots['p1@2000'] = pageDoc('v2')

    const second = publishPost({
      post,
      takenSlugs: [],
      frontier: { p1: { hash: 'h2', yjsSnapshotRef: 'p1@2000' } },
      now: NOW + 5000
    })
    post = { ...post, ...second.patch }

    const resolved = await resolvePublishedDoc(post, live, (ref) => snapshots[ref] ?? null)
    expect(renderPost(resolved.doc).html).toContain('v2')
    // The original publication date survives a re-publish.
    expect(post.publishedAt).toBe(NOW)
  })

  it('falls back with a warning when the snapshot is pruned', async () => {
    const live = pageDoc('current text')
    const post: PostRecord = {
      id: 'p1',
      title: 'T',
      publishedAt: NOW,
      publishedFrontier: { p1: { hash: 'h1', yjsSnapshotRef: 'p1@999' } }
    }
    const resolved = await resolvePublishedDoc(post, live, () => null)
    expect(resolved.source).toBe('fallback')
    expect(resolved.warning).toContain('unavailable')
    // Falls back to something readable rather than nothing — but says so.
    expect(resolved.doc).toBe(live)
  })

  it('falls back with a warning when no resolver is supplied', async () => {
    const live = pageDoc('current')
    const post: PostRecord = {
      id: 'p1',
      title: 'T',
      publishedAt: NOW,
      publishedFrontier: { p1: { hash: 'h1', yjsSnapshotRef: 'p1@1' } }
    }
    const resolved = await resolvePublishedDoc(post, live)
    expect(resolved.source).toBe('fallback')
    expect(resolved.warning).toContain('no snapshot resolver')
  })

  it('falls back rather than throwing when the resolver rejects', async () => {
    const live = pageDoc('current')
    const post: PostRecord = {
      id: 'p1',
      title: 'T',
      publishedAt: NOW,
      publishedFrontier: { p1: { hash: 'h1', yjsSnapshotRef: 'p1@1' } }
    }
    const resolved = await resolvePublishedDoc(post, live, () => {
      throw new Error('storage offline')
    })
    expect(resolved.source).toBe('fallback')
    expect(resolved.warning).toContain('storage offline')
  })
})
