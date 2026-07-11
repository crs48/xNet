/**
 * Tests for RichTextEditor component
 */
import type { PageTaskSnapshot } from '../extensions/page-tasks'
import type { Editor } from '@tiptap/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TextSelection } from '@tiptap/pm/state'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  yCursorPluginKey,
  ySyncPluginKey,
  yUndoPluginKey
} from '@tiptap/y-tiptap'
import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// import userEvent from '@testing-library/user-event'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { CommentMark, captureTextAnchor, resolveTextAnchor } from '../extensions/comment'
import { generateLargeDocument } from '../testing/benchmarks'
import { measureAsync } from '../utils/performance'
import { RichTextEditor } from './RichTextEditor'

const TYPICAL_PAGE_BLOCKS = 120
const INITIAL_MOUNT_READY_BUDGET_MS = 3000
const ALICE_DID = 'did:key:z6MkhAliceEditorClient'
const BOB_DID = 'did:key:z6MkhBobEditorClient'

function pressBackspace(editor: Editor): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
  let handled = false

  editor.view.someProp('handleKeyDown', (handler) => {
    if (handled) {
      return
    }

    handled = handler(editor.view, event)
  })

  return handled
}

function firstBlock(editor: Editor) {
  return editor.getJSON().content?.[0]
}

function findTextStart(editor: Editor, text: string): number {
  let position: number | null = null

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || typeof node.text !== 'string') return true

    const index = node.text.indexOf(text)
    if (index === -1) return true

    position = pos + index
    return false
  })

  if (position === null) {
    throw new Error(`Could not find text "${text}"`)
  }

  return position
}

function setEditorSelection(editor: Editor, from: number, to = from) {
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to))
  )
}

function clearCollaborationUndo(editor: Editor) {
  yUndoPluginKey.getState(editor.state)?.undoManager?.clear()
}

function publishAwarenessSelection(editor: Editor, awareness: Awareness, from: number, to = from) {
  const ystate = ySyncPluginKey.getState(editor.state)
  const anchor = absolutePositionToRelativePosition(from, ystate.type, ystate.binding.mapping)
  const head = absolutePositionToRelativePosition(to, ystate.type, ystate.binding.mapping)

  awareness.setLocalStateField('cursor', { anchor, head })
}

function refreshCursorDecorations(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))
}

function waitForSyncedContent(editor: Editor | null, content: unknown) {
  return waitFor(() => {
    expect(editor?.getJSON().content).toEqual(content)
  })
}

function exchangeYjsUpdates(
  docA: Y.Doc,
  docB: Y.Doc,
  stateVectorA: Uint8Array,
  stateVectorB: Uint8Array
) {
  const updateA = Y.encodeStateAsUpdate(docA, stateVectorA)
  const updateB = Y.encodeStateAsUpdate(docB, stateVectorB)

  Y.applyUpdate(docA, updateB, docB)
  Y.applyUpdate(docB, updateA, docA)
}

function connectYDocs(docA: Y.Doc, docB: Y.Doc): () => void {
  const forwardA = (update: Uint8Array, origin: unknown) => {
    if (origin === docB) return
    Y.applyUpdate(docB, update, docA)
  }
  const forwardB = (update: Uint8Array, origin: unknown) => {
    if (origin === docA) return
    Y.applyUpdate(docA, update, docB)
  }

  docA.on('update', forwardA)
  docB.on('update', forwardB)

  return () => {
    docA.off('update', forwardA)
    docB.off('update', forwardB)
  }
}

describe('RichTextEditor', () => {
  let ydoc: Y.Doc

  beforeEach(() => {
    ydoc = new Y.Doc()
  })

  afterEach(() => {
    ydoc.destroy()
  })

  describe('initialization', () => {
    it('should render editor container', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} />)

      // The editor container should be rendered with relative positioning
      await waitFor(() => {
        const editorContainer = container.firstChild as HTMLElement
        expect(editorContainer).toBeInTheDocument()
        expect(editorContainer.classList.contains('relative')).toBe(true)
      })
    })

    it('should render editor content area', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        // EditorContent component renders with flex-1 class for full height
        const editorContent = container.querySelector('.flex-1')
        expect(editorContent).toBeInTheDocument()
      })
    })

    it('should render ProseMirror editor', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })
    })

    it('should show placeholder text', async () => {
      render(<RichTextEditor ydoc={ydoc} placeholder="Start typing..." />)

      await waitFor(() => {
        const placeholder = document.querySelector('[data-placeholder]')
        expect(placeholder?.getAttribute('data-placeholder')).toBe('Start typing...')
      })
    })

    it('should use default placeholder', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        const placeholder = document.querySelector('[data-placeholder]')
        expect(placeholder?.getAttribute('data-placeholder')).toBe('Start writing...')
      })
    })

    it('should expose an accessible body label', async () => {
      render(<RichTextEditor ydoc={ydoc} editorLabel="Page body" />)

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: 'Page body' })).toBeInTheDocument()
      })
    })
  })

  describe('toolbar visibility', () => {
    it('should render editor with showToolbar enabled by default', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        // Editor should render with the ProseMirror class
        const editor = container.querySelector('.ProseMirror')
        expect(editor).toBeInTheDocument()
      })
    })

    it('should render editor when showToolbar is false', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} showToolbar={false} />)

      await waitFor(() => {
        const editorContainer = container.firstChild
        expect(editorContainer).toBeInTheDocument()
      })

      // The editor should still work, but toolbar is disabled
      const editor = container.querySelector('.ProseMirror')
      expect(editor).toBeInTheDocument()
    })
  })

  describe('content modes', () => {
    it('renders Markdown source mode without the rich editor surface', async () => {
      render(<RichTextEditor ydoc={ydoc} contentMode="source" placeholder="Write source..." />)

      const sourceEditor = await screen.findByTestId('editor-source-mode')
      expect(sourceEditor).toHaveAttribute('placeholder', 'Write source...')
      expect(sourceEditor).toHaveAccessibleName('Rich text editor Markdown source')
      expect(document.querySelector('.ProseMirror')).not.toBeInTheDocument()

      fireEvent.change(sourceEditor, { target: { value: '## Source heading' } })
      expect(sourceEditor).toHaveValue('## Source heading')
      expect(screen.queryByTestId('editor-desktop-toolbar')).not.toBeInTheDocument()
    })
  })

  describe('custom className', () => {
    it('should apply custom className to container', async () => {
      render(<RichTextEditor ydoc={ydoc} className="my-custom-editor" />)

      await waitFor(() => {
        expect(document.querySelector('.my-custom-editor')).toBeInTheDocument()
      })
    })

    it('should merge custom className with default Tailwind classes', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} className="my-custom-editor" />)

      await waitFor(() => {
        const editorContainer = container.querySelector('.my-custom-editor') as HTMLElement
        expect(editorContainer).toBeInTheDocument()
        // Should have both custom class and relative positioning
        expect(editorContainer.classList.contains('relative')).toBe(true)
      })
    })
  })

  describe('Yjs collaboration', () => {
    it('should create XmlFragment with specified field name', async () => {
      render(<RichTextEditor ydoc={ydoc} field="customField" />)

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })

      // Verify the XmlFragment was created
      const fragment = ydoc.getXmlFragment('customField')
      expect(fragment).toBeDefined()
    })

    it('should use default field name "content"', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })

      const fragment = ydoc.getXmlFragment('content')
      expect(fragment).toBeDefined()
    })

    it('publishes page task snapshots from structured ProseMirror docs', async () => {
      let readyEditor: Editor | null = null
      const onPageTasksChange = vi.fn<(tasks: PageTaskSnapshot[]) => void>()
      const aliceDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'

      render(
        <RichTextEditor
          ydoc={ydoc}
          showToolbar={false}
          onPageTasksChange={onPageTasksChange}
          onEditorReady={(editor) => {
            readyEditor = editor
          }}
        />
      )

      await screen.findByRole('textbox', { name: 'Rich text editor' })
      await waitFor(() => expect(readyEditor).not.toBeNull())

      act(() => {
        readyEditor?.commands.setContent({
          type: 'doc',
          content: [
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Ship editor polish' }]
                    },
                    {
                      type: 'taskList',
                      content: [
                        {
                          type: 'taskItem',
                          attrs: { checked: true },
                          content: [
                            {
                              type: 'paragraph',
                              content: [
                                { type: 'text', text: 'Verify task extraction ' },
                                {
                                  type: 'taskMention',
                                  attrs: {
                                    id: aliceDid,
                                    label: 'alice'
                                  }
                                },
                                {
                                  type: 'taskDueDate',
                                  attrs: {
                                    date: '2026-06-15'
                                  }
                                },
                                {
                                  type: 'smartReference',
                                  attrs: {
                                    url: 'https://github.com/xnetjs/xNet/issues/137',
                                    provider: 'github',
                                    kind: 'issue',
                                    refId: 'xnetjs/xNet#137',
                                    title: 'Improve pages editor',
                                    subtitle: 'xnetjs/xNet',
                                    icon: 'GH',
                                    embedUrl: null,
                                    metadata: '{"repo":"xnetjs/xNet"}'
                                  }
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        })
      })

      const getStructuredTaskUpdate = (): PageTaskSnapshot[] | undefined =>
        [...onPageTasksChange.mock.calls]
          .reverse()
          .map(([tasks]) => tasks)
          .find((tasks) => tasks.length === 2)

      await waitFor(() => {
        expect(getStructuredTaskUpdate()).toBeDefined()
      })

      const tasks = getStructuredTaskUpdate()
      expect(tasks?.[0]).toMatchObject({
        title: 'Ship editor polish',
        completed: false,
        parentTaskId: null,
        sortKey: '0000'
      })
      expect(tasks?.[0].taskId).toEqual(expect.any(String))
      expect(tasks?.[0].blockId).toEqual(expect.any(String))
      expect(tasks?.[1]).toMatchObject({
        title: 'Verify task extraction',
        completed: true,
        parentTaskId: tasks?.[0].taskId,
        sortKey: '0000.0000',
        assignees: [aliceDid],
        dueDate: '2026-06-15'
      })
      expect(tasks?.[1].references).toEqual([
        expect.objectContaining({
          provider: 'github',
          kind: 'issue',
          refId: 'xnetjs/xNet#137'
        })
      ])
    })

    it('reloads persisted custom embed nodes without losing their attributes', async () => {
      let readyEditor: Editor | null = null
      const { unmount } = render(
        <RichTextEditor
          ydoc={ydoc}
          showToolbar={false}
          onEditorReady={(editor) => {
            readyEditor = editor
          }}
        />
      )

      await screen.findByRole('textbox', { name: 'Rich text editor' })
      await waitFor(() => expect(readyEditor).not.toBeNull())

      act(() => {
        readyEditor?.commands.setContent({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Reference ' },
                {
                  type: 'smartReference',
                  attrs: {
                    url: 'https://github.com/xnetjs/xNet/issues/301',
                    provider: 'github',
                    kind: 'issue',
                    refId: '301',
                    title: 'Issue 301',
                    subtitle: 'Editor polish',
                    icon: 'GH',
                    metadata: '{"repo":"xNet"}'
                  }
                }
              ]
            },
            {
              type: 'databaseEmbed',
              attrs: {
                databaseId: 'db-roadmap',
                viewType: 'board',
                viewConfig: { groupBy: 'status' },
                showTitle: false,
                maxHeight: 560
              }
            },
            {
              type: 'embed',
              attrs: {
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                provider: 'youtube',
                embedId: 'dQw4w9WgXcQ',
                embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                title: 'Launch demo',
                width: 640,
                alignment: 'center'
              }
            },
            {
              type: 'pageEmbed',
              attrs: {
                pageId: 'default/roadmap',
                title: 'Roadmap',
                subtitle: 'Planning page',
                icon: 'RD',
                preview: 'Launch milestones.'
              }
            }
          ]
        })
      })

      await waitFor(() => {
        expect(
          readyEditor
            ?.getJSON()
            .content?.slice(0, 4)
            .map((node) => node.type)
        ).toEqual(['paragraph', 'databaseEmbed', 'embed', 'pageEmbed'])
      })

      const persistedUpdate = Y.encodeStateAsUpdate(ydoc)
      unmount()

      const reloadedDoc = new Y.Doc()
      Y.applyUpdate(reloadedDoc, persistedUpdate)
      let reloadedEditor: Editor | null = null

      try {
        render(
          <RichTextEditor
            ydoc={reloadedDoc}
            showToolbar={false}
            onEditorReady={(editor) => {
              reloadedEditor = editor
            }}
          />
        )

        await waitFor(() => expect(reloadedEditor).not.toBeNull())
        await waitFor(() => {
          expect(reloadedEditor?.getJSON().content?.slice(0, 4)).toMatchObject([
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Reference ' },
                {
                  type: 'smartReference',
                  attrs: {
                    url: 'https://github.com/xnetjs/xNet/issues/301',
                    provider: 'github',
                    kind: 'issue',
                    refId: '301',
                    title: 'Issue 301',
                    subtitle: 'Editor polish',
                    icon: 'GH',
                    metadata: '{"repo":"xNet"}'
                  }
                }
              ]
            },
            {
              type: 'databaseEmbed',
              attrs: {
                databaseId: 'db-roadmap',
                viewType: 'board',
                viewConfig: { groupBy: 'status' },
                showTitle: false,
                maxHeight: 560
              }
            },
            {
              type: 'embed',
              attrs: {
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                provider: 'youtube',
                embedId: 'dQw4w9WgXcQ',
                embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                title: 'Launch demo',
                width: 640,
                alignment: 'center'
              }
            },
            {
              type: 'pageEmbed',
              attrs: {
                pageId: 'default/roadmap',
                title: 'Roadmap',
                subtitle: 'Planning page',
                icon: 'RD',
                preview: 'Launch milestones.'
              }
            }
          ])
        })
      } finally {
        reloadedDoc.destroy()
      }
    })

    it('mounts a typical persisted page within the ready budget', async () => {
      const seedDoc = new Y.Doc()
      let seedEditor: Editor | null = null
      const { unmount } = render(
        <RichTextEditor
          ydoc={seedDoc}
          showToolbar={false}
          onEditorReady={(editor) => {
            seedEditor = editor
          }}
        />
      )

      await waitFor(() => expect(seedEditor).not.toBeNull())

      act(() => {
        seedEditor?.commands.setContent(generateLargeDocument(TYPICAL_PAGE_BLOCKS, 16))
      })

      await waitFor(() => {
        expect(seedEditor?.getJSON().content?.length).toBeGreaterThan(100)
      })

      const persistedUpdate = Y.encodeStateAsUpdate(seedDoc)
      unmount()
      seedDoc.destroy()

      const persistedDoc = new Y.Doc()
      Y.applyUpdate(persistedDoc, persistedUpdate)
      let mountedEditor: Editor | null = null

      try {
        const mounted = await measureAsync(async () => {
          render(
            <RichTextEditor
              ydoc={persistedDoc}
              showToolbar={false}
              onEditorReady={(editor) => {
                mountedEditor = editor
              }}
            />
          )

          await waitFor(() => expect(mountedEditor).not.toBeNull())
        })

        expect(mountedEditor?.getJSON().content?.length).toBeGreaterThan(100)
        expect(mounted.duration).toBeLessThan(INITIAL_MOUNT_READY_BUDGET_MS)
      } finally {
        persistedDoc.destroy()
      }
    })

    it('keeps heading token behavior deterministic after concurrent client edits', async () => {
      const aliceDoc = new Y.Doc()
      const bobDoc = new Y.Doc()
      let aliceEditor: Editor | null = null
      let bobEditor: Editor | null = null

      try {
        render(
          <RichTextEditor
            ydoc={aliceDoc}
            showToolbar={false}
            editorLabel="Alice editor"
            onEditorReady={(editor) => {
              aliceEditor = editor
            }}
          />
        )

        await waitFor(() => expect(aliceEditor).not.toBeNull())

        act(() => {
          aliceEditor?.commands.setContent({
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [{ type: 'text', text: 'Launch plan' }]
              }
            ]
          })
        })

        Y.applyUpdate(bobDoc, Y.encodeStateAsUpdate(aliceDoc), aliceDoc)

        render(
          <RichTextEditor
            ydoc={bobDoc}
            showToolbar={false}
            editorLabel="Bob editor"
            onEditorReady={(editor) => {
              bobEditor = editor
            }}
          />
        )

        await waitFor(() => expect(bobEditor).not.toBeNull())
        await waitForSyncedContent(bobEditor, aliceEditor?.getJSON().content)

        const aliceStateVector = Y.encodeStateVector(aliceDoc)
        const bobStateVector = Y.encodeStateVector(bobDoc)

        act(() => {
          aliceEditor?.commands.setTextSelection(1)
          expect(aliceEditor && pressBackspace(aliceEditor)).toBe(true)
        })

        act(() => {
          if (!bobEditor) return
          const insertAt = findTextStart(bobEditor, 'Launch plan') + 'Launch plan'.length
          bobEditor.commands.setTextSelection(insertAt)
          bobEditor.commands.insertContent(' from Bob')
        })

        act(() => {
          exchangeYjsUpdates(aliceDoc, bobDoc, aliceStateVector, bobStateVector)
        })

        await waitFor(() => {
          expect(firstBlock(aliceEditor!)).toMatchObject({
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Launch plan from Bob' }]
          })
          expect(firstBlock(bobEditor!)).toMatchObject({
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Launch plan from Bob' }]
          })
        })
      } finally {
        aliceDoc.destroy()
        bobDoc.destroy()
      }
    })

    it('round-trips a doc spanning custom and 0297-adopted nodes between two clients', async () => {
      const aliceDoc = new Y.Doc()
      const bobDoc = new Y.Doc()
      let aliceEditor: Editor | null = null
      let bobEditor: Editor | null = null

      try {
        render(
          <RichTextEditor
            ydoc={aliceDoc}
            showToolbar={false}
            editorLabel="Alice editor"
            onEditorReady={(editor) => {
              aliceEditor = editor
            }}
          />
        )
        await waitFor(() => expect(aliceEditor).not.toBeNull())

        act(() => {
          aliceEditor?.commands.setContent({
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Kitchen sink' }]
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Hello ' },
                  { type: 'emoji', attrs: { name: 'smile' } },
                  { type: 'text', text: ' with ' },
                  { type: 'inlineMath', attrs: { latex: 'a^2+b^2' } },
                  { type: 'text', text: ' and a ', marks: [{ type: 'bold' }] },
                  {
                    type: 'text',
                    text: 'link',
                    marks: [{ type: 'wikilink', attrs: { href: 'default/target' } }]
                  }
                ]
              },
              { type: 'blockMath', attrs: { latex: '\\int_0^1 x\\,dx' } },
              {
                type: 'callout',
                attrs: { type: 'info' },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Callout body' }] }]
              },
              {
                type: 'toggle',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden body' }] }]
              },
              {
                type: 'codeBlock',
                attrs: { language: 'ts' },
                content: [{ type: 'text', text: 'const x = 1' }]
              },
              {
                type: 'blockquote',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }]
              }
            ]
          })
        })

        Y.applyUpdate(bobDoc, Y.encodeStateAsUpdate(aliceDoc), aliceDoc)

        render(
          <RichTextEditor
            ydoc={bobDoc}
            showToolbar={false}
            editorLabel="Bob editor"
            onEditorReady={(editor) => {
              bobEditor = editor
            }}
          />
        )
        await waitFor(() => expect(bobEditor).not.toBeNull())

        // Bob must see identical structure — Yjs drops nothing.
        await waitForSyncedContent(bobEditor, aliceEditor?.getJSON().content)

        const bobJson = JSON.stringify(bobEditor!.getJSON())
        for (const marker of [
          'emoji',
          'inlineMath',
          'blockMath',
          'callout',
          'toggle',
          'wikilink'
        ]) {
          expect(bobJson).toContain(marker)
        }
      } finally {
        aliceDoc.destroy()
        bobDoc.destroy()
      }
    })

    it('keeps undo and redo local while syncing remote collaboration edits', async () => {
      const aliceDoc = new Y.Doc()
      const bobDoc = new Y.Doc()
      const disconnect = connectYDocs(aliceDoc, bobDoc)
      let aliceEditor: Editor | null = null
      let bobEditor: Editor | null = null

      try {
        render(
          <>
            <RichTextEditor
              ydoc={aliceDoc}
              showToolbar={false}
              editorLabel="Alice editor"
              onEditorReady={(editor) => {
                aliceEditor = editor
              }}
            />
            <RichTextEditor
              ydoc={bobDoc}
              showToolbar={false}
              editorLabel="Bob editor"
              onEditorReady={(editor) => {
                bobEditor = editor
              }}
            />
          </>
        )

        await waitFor(() => expect(aliceEditor).not.toBeNull())
        await waitFor(() => expect(bobEditor).not.toBeNull())

        act(() => {
          aliceEditor?.commands.setContent({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }]
          })
        })

        await waitForSyncedContent(bobEditor, aliceEditor?.getJSON().content)
        clearCollaborationUndo(aliceEditor!)
        clearCollaborationUndo(bobEditor!)

        act(() => {
          if (!aliceEditor) return
          const insertAt = findTextStart(aliceEditor, 'Draft') + 'Draft'.length
          aliceEditor.commands.setTextSelection(insertAt)
          aliceEditor.commands.insertContent(' from Alice')
        })

        await waitFor(() => {
          expect(bobEditor?.state.doc.textContent).toBe('Draft from Alice')
        })

        act(() => {
          if (!bobEditor) return
          const insertAt = findTextStart(bobEditor, 'Draft from Alice') + 'Draft from Alice'.length
          bobEditor.commands.setTextSelection(insertAt)
          bobEditor.commands.insertContent(' from Bob')
        })

        await waitFor(() => {
          expect(aliceEditor?.state.doc.textContent).toBe('Draft from Alice from Bob')
        })

        act(() => {
          expect(aliceEditor?.commands.undo()).toBe(true)
        })

        await waitFor(() => {
          expect(aliceEditor?.state.doc.textContent).toBe('Draft from Bob')
          expect(bobEditor?.state.doc.textContent).toBe('Draft from Bob')
        })

        act(() => {
          expect(aliceEditor?.commands.redo()).toBe(true)
        })

        await waitFor(() => {
          expect(aliceEditor?.state.doc.textContent).toBe('Draft from Alice from Bob')
          expect(bobEditor?.state.doc.textContent).toBe('Draft from Alice from Bob')
        })
      } finally {
        disconnect()
        aliceDoc.destroy()
        bobDoc.destroy()
      }
    })

    it('renders remote cursors inside headings with revealed markdown syntax', async () => {
      const aliceDoc = new Y.Doc()
      const bobDoc = new Y.Doc()
      const aliceAwareness = new Awareness(aliceDoc)
      const bobAwareness = new Awareness(bobDoc)
      const disconnectDocs = connectYDocs(aliceDoc, bobDoc)
      let aliceEditor: Editor | null = null
      let bobEditor: Editor | null = null

      try {
        render(
          <>
            <RichTextEditor
              ydoc={aliceDoc}
              showToolbar={false}
              editorLabel="Alice editor"
              onEditorReady={(editor) => {
                aliceEditor = editor
              }}
            />
            <RichTextEditor
              ydoc={bobDoc}
              awareness={bobAwareness}
              did={BOB_DID}
              showToolbar={false}
              editorLabel="Bob editor"
              onEditorReady={(editor) => {
                bobEditor = editor
              }}
            />
          </>
        )

        await waitFor(() => expect(aliceEditor).not.toBeNull())
        await waitFor(() => expect(bobEditor).not.toBeNull())

        act(() => {
          aliceEditor?.commands.setContent({
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [{ type: 'text', text: 'Cursor heading' }]
              }
            ]
          })
        })

        await waitForSyncedContent(bobEditor, aliceEditor?.getJSON().content)

        await waitFor(() => {
          expect(bobAwareness.getLocalState()?.user).toBeDefined()
        })

        act(() => {
          if (!bobEditor) return
          setEditorSelection(bobEditor, 1)
        })

        await waitFor(() => {
          expect(document.querySelector('.heading-syntax')?.textContent.trim()).toBe('###')
        })

        act(() => {
          if (!aliceEditor) return
          const from = findTextStart(aliceEditor, 'Cursor')
          const to = from + 'Cursor'.length
          aliceAwareness.setLocalStateField('user', {
            did: ALICE_DID,
            name: `${ALICE_DID.slice(8, 16)}...`,
            color: '#2563eb'
          })
          publishAwarenessSelection(aliceEditor, aliceAwareness, from, to)
          applyAwarenessUpdate(
            bobAwareness,
            encodeAwarenessUpdate(aliceAwareness, [aliceAwareness.clientID]),
            aliceAwareness
          )
        })

        await waitFor(() => {
          expect(bobAwareness.getStates().get(aliceAwareness.clientID)?.cursor).toBeDefined()
        })
        await waitFor(() => {
          expect(ySyncPluginKey.getState(bobEditor!.state)?.binding.mapping.size).toBeGreaterThan(0)
        })
        await waitFor(() => {
          const cursor = bobAwareness.getStates().get(aliceAwareness.clientID)?.cursor
          const ystate = ySyncPluginKey.getState(bobEditor!.state)
          const anchor = relativePositionToAbsolutePosition(
            ystate.doc,
            ystate.type,
            Y.createRelativePositionFromJSON(cursor.anchor),
            ystate.binding.mapping
          )

          expect(anchor).not.toBeNull()
        })

        act(() => {
          refreshCursorDecorations(bobEditor!)
        })

        await waitFor(() => {
          expect(yCursorPluginKey.getState(bobEditor!.state)?.find()).toHaveLength(2)
          expect(
            document.querySelector(
              `.collaboration-cursor__caret[data-client-id="${aliceAwareness.clientID}"]`
            )
          ).toBeInTheDocument()
          expect(
            document.querySelector(
              `.ProseMirror-yjs-selection[data-client-id="${aliceAwareness.clientID}"]`
            )
          ).toBeInTheDocument()
        })
      } finally {
        disconnectDocs()
        aliceAwareness.destroy()
        bobAwareness.destroy()
        aliceDoc.destroy()
        bobDoc.destroy()
      }
    })

    it('keeps comment anchors attached when markdown structural tokens change', async () => {
      let readyEditor: Editor | null = null

      render(
        <RichTextEditor
          ydoc={ydoc}
          showToolbar={false}
          extensions={[CommentMark]}
          onEditorReady={(editor) => {
            readyEditor = editor
          }}
        />
      )

      await waitFor(() => expect(readyEditor).not.toBeNull())

      act(() => {
        readyEditor?.commands.setContent({
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Anchored heading' }]
            }
          ]
        })
      })

      let anchor: ReturnType<typeof captureTextAnchor> = null

      act(() => {
        if (!readyEditor) return
        const from = findTextStart(readyEditor, 'Anchored')
        readyEditor.commands.setTextSelection({ from, to: from + 'Anchored'.length })
        anchor = captureTextAnchor(readyEditor)
        readyEditor.commands.setComment('comment-1')
      })

      expect(anchor).not.toBeNull()

      act(() => {
        readyEditor?.commands.setTextSelection(1)
        expect(readyEditor && pressBackspace(readyEditor)).toBe(true)
      })

      const resolvedAnchor = resolveTextAnchor(readyEditor!, anchor!)
      expect(resolvedAnchor).not.toBeNull()
      expect(
        readyEditor!.state.doc.textBetween(resolvedAnchor!.from, resolvedAnchor!.to, ' ')
      ).toBe('Anchored')
      expect(firstBlock(readyEditor!)).toMatchObject({
        type: 'heading',
        attrs: { level: 2 }
      })

      let hasCommentMark = false
      readyEditor!.state.doc.descendants((node) => {
        hasCommentMark ||= node.marks.some(
          (mark) => mark.type.name === 'comment' && mark.attrs.commentId === 'comment-1'
        )
      })

      expect(hasCommentMark).toBe(true)
    })
  })

  describe('read-only mode', () => {
    it('should be editable by default', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        const editor = document.querySelector('.ProseMirror')
        expect(editor?.getAttribute('contenteditable')).toBe('true')
      })
    })

    it('should not be editable when readOnly is true', async () => {
      render(<RichTextEditor ydoc={ydoc} readOnly={true} />)

      await waitFor(() => {
        const editor = document.querySelector('.ProseMirror')
        expect(editor?.getAttribute('contenteditable')).toBe('false')
      })
    })
  })

  describe('navigation callback', () => {
    it('should accept onNavigate prop without error', async () => {
      const onNavigate = vi.fn()

      // Should not throw
      expect(() => {
        render(<RichTextEditor ydoc={ydoc} onNavigate={onNavigate} />)
      }).not.toThrow()

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })
    })
  })

  describe('ready callback', () => {
    it('notifies once per editor instance when parent re-renders with a new callback', async () => {
      const onReady = vi.fn()

      function Harness() {
        const [, setRevision] = useState(0)

        return (
          <RichTextEditor
            ydoc={ydoc}
            onEditorReady={(editor) => {
              onReady(editor)
              setRevision((revision) => revision + 1)
            }}
          />
        )
      }

      render(<Harness />)

      await waitFor(() => {
        expect(onReady).toHaveBeenCalledTimes(1)
      })

      await new Promise((resolve) => window.setTimeout(resolve, 50))
      expect(onReady).toHaveBeenCalledTimes(1)
    })
  })

  describe('empty first block Backspace handoff', () => {
    it('calls the host callback and prevents default Backspace at an empty first block', async () => {
      const onBackspaceAtStart = vi.fn(() => true)
      let readyEditor: Editor | null = null

      render(
        <RichTextEditor
          ydoc={ydoc}
          showToolbar={false}
          onBackspaceAtStart={onBackspaceAtStart}
          onEditorReady={(editor) => {
            readyEditor = editor
          }}
        />
      )

      await screen.findByRole('textbox', { name: 'Rich text editor' })
      await waitFor(() => expect(readyEditor).not.toBeNull())
      const editorDom = document.querySelector('.ProseMirror') as HTMLElement

      act(() => {
        readyEditor?.commands.focus('start')
      })

      const eventAllowed = fireEvent.keyDown(editorDom, { key: 'Backspace' })

      expect(eventAllowed).toBe(false)
      expect(onBackspaceAtStart).toHaveBeenCalledTimes(1)
    })

    it('lets ProseMirror handle Backspace when the first block has text', async () => {
      const onBackspaceAtStart = vi.fn(() => true)
      let readyEditor: Editor | null = null

      render(
        <RichTextEditor
          ydoc={ydoc}
          showToolbar={false}
          onBackspaceAtStart={onBackspaceAtStart}
          onEditorReady={(editor) => {
            readyEditor = editor
          }}
        />
      )

      await screen.findByRole('textbox', { name: 'Rich text editor' })
      await waitFor(() => expect(readyEditor).not.toBeNull())
      const editorDom = document.querySelector('.ProseMirror') as HTMLElement

      act(() => {
        readyEditor?.commands.setContent('<p>Body</p>')
        readyEditor?.commands.focus('start')
      })

      const eventAllowed = fireEvent.keyDown(editorDom, { key: 'Backspace' })

      expect(eventAllowed).toBe(true)
      expect(onBackspaceAtStart).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should unmount without errors', async () => {
      const { unmount } = render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })

      // Should not throw
      expect(() => unmount()).not.toThrow()
    })
  })
})

describe('RichTextEditor floating toolbar', () => {
  let ydoc: Y.Doc

  beforeEach(() => {
    ydoc = new Y.Doc()
  })

  afterEach(() => {
    ydoc.destroy()
  })

  it('should not show toolbar when no text is selected', async () => {
    const { container } = render(<RichTextEditor ydoc={ydoc} />)

    // Wait for editor to initialize
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeInTheDocument()
    })

    // BubbleMenu toolbar should not be visible without text selection
    expect(screen.queryByTitle('Bold')).not.toBeInTheDocument()
  })

  it('should pass showToolbar prop to control toolbar visibility', async () => {
    const { container } = render(<RichTextEditor ydoc={ydoc} showToolbar={true} />)

    // Wait for editor to initialize
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeInTheDocument()
    })

    // Toolbar is controlled by showToolbar prop and text selection
    // Since no text is selected, toolbar won't be visible even with showToolbar=true
    expect(screen.queryByTitle('Bold')).not.toBeInTheDocument()
  })

  it('should not render toolbar when showToolbar is false', async () => {
    const { container } = render(<RichTextEditor ydoc={ydoc} showToolbar={false} />)

    // Wait for editor to initialize
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeInTheDocument()
    })

    // With showToolbar=false, toolbar should never render
    expect(screen.queryByTitle('Bold')).not.toBeInTheDocument()
  })
})
