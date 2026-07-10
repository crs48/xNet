/**
 * Two-peer rich-link hydration race regression (exploration 0295).
 *
 * Peer A pastes a URL while peer B has the same Yjs document open. The
 * invariant under test: exactly ONE card exists, only the pasting peer's
 * resolver runs, and both peers converge on the hydrated attrs — i.e. no
 * render-time hydration and no duplicate/clobbered writes.
 */
import type { MessageLinkPreview } from '@xnetjs/data'
import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { RichLinkExtension } from './RichLinkExtension'

const URL_PASTED = 'https://example.com/docs/guide'

const RESOLVED: MessageLinkPreview = {
  url: URL_PASTED,
  kind: 'external',
  title: 'The Definitive Guide',
  description: 'Everything about the thing.',
  providerName: 'Example Docs',
  domain: 'example.com',
  resolvedAt: 1
}

function connectDocs(a: Y.Doc, b: Y.Doc): void {
  a.on('update', (update: Uint8Array) => Y.applyUpdate(b, update))
  b.on('update', (update: Uint8Array) => Y.applyUpdate(a, update))
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
}

function makePeer(
  ydoc: Y.Doc,
  resolvePreview: (url: string) => Promise<MessageLinkPreview | null>
): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: ydoc, field: 'content' }),
      RichLinkExtension.configure({ resolvePreview })
    ]
  })
}

function richLinks(editor: Editor): Array<Record<string, unknown>> {
  return (editor.getJSON().content ?? [])
    .filter((node) => node.type === 'richLink')
    .map((node) => node.attrs as Record<string, unknown>)
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('RichLinkExtension two-peer hydration (0295)', () => {
  it('hydrates once from the pasting peer and converges on both', async () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    connectDocs(docA, docB)

    let releaseResolve: (value: MessageLinkPreview | null) => void = () => {}
    const resolverA = vi.fn(
      () =>
        new Promise<MessageLinkPreview | null>((resolve) => {
          releaseResolve = resolve
        })
    )
    const resolverB = vi.fn(async () => RESOLVED)

    const peerA = makePeer(docA, resolverA)
    const peerB = makePeer(docB, resolverB)

    try {
      // Peer A pastes while B is watching.
      expect(peerA.commands.setRichLink(URL_PASTED)).toBe(true)
      await flush()

      // B sees exactly one un-hydrated card; B's resolver never ran.
      expect(richLinks(peerB)).toHaveLength(1)
      expect(richLinks(peerB)[0]).toMatchObject({ url: URL_PASTED, title: 'example.com' })
      expect(resolverA).toHaveBeenCalledTimes(1)
      expect(resolverB).not.toHaveBeenCalled()

      // Metadata arrives on A → single follow-up transaction.
      releaseResolve(RESOLVED)
      await flush()
      await flush()

      for (const peer of [peerA, peerB]) {
        const cards = richLinks(peer)
        expect(cards).toHaveLength(1)
        expect(cards[0]).toMatchObject({
          url: URL_PASTED,
          title: 'The Definitive Guide',
          subtitle: 'Example Docs — Everything about the thing.'
        })
      }
      expect(resolverB).not.toHaveBeenCalled()
    } finally {
      peerA.destroy()
      peerB.destroy()
    }
  })

  it('is a silent no-op when the card is gone before metadata resolves', async () => {
    const docA = new Y.Doc()
    let releaseResolve: (value: MessageLinkPreview | null) => void = () => {}
    const resolver = vi.fn(
      () =>
        new Promise<MessageLinkPreview | null>((resolve) => {
          releaseResolve = resolve
        })
    )
    const peer = makePeer(docA, resolver)

    try {
      expect(peer.commands.setRichLink(URL_PASTED)).toBe(true)
      peer.commands.setContent('<p>gone</p>')
      releaseResolve(RESOLVED)
      await flush()
      await flush()

      expect(richLinks(peer)).toHaveLength(0)
      expect(peer.getText()).toContain('gone')
    } finally {
      peer.destroy()
    }
  })

  it('identical concurrent pastes each hydrate their own card', async () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    connectDocs(docA, docB)

    const peerA = makePeer(docA, async () => RESOLVED)
    const peerB = makePeer(docB, async () => RESOLVED)

    try {
      // Two genuine intents: both peers paste the same URL.
      peerA.commands.setRichLink(URL_PASTED)
      peerB.commands.setRichLink(URL_PASTED)
      await flush()
      await flush()

      const cardsA = richLinks(peerA)
      const cardsB = richLinks(peerB)
      // Two cards is the correct outcome (two intents) — and both hydrate.
      expect(cardsA).toHaveLength(2)
      expect(cardsB).toHaveLength(2)
      for (const card of [...cardsA, ...cardsB]) {
        expect(card.title).toBe('The Definitive Guide')
      }
    } finally {
      peerA.destroy()
      peerB.destroy()
    }
  })
})
