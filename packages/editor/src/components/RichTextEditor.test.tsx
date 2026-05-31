/**
 * Tests for RichTextEditor component
 */
import type { PageTaskSnapshot } from '../extensions/page-tasks'
import type { Editor } from '@tiptap/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// import userEvent from '@testing-library/user-event'
import * as Y from 'yjs'
import { generateLargeDocument } from '../testing/benchmarks'
import { measureAsync } from '../utils/performance'
import { RichTextEditor } from './RichTextEditor'

const TYPICAL_PAGE_BLOCKS = 120
const INITIAL_MOUNT_READY_BUDGET_MS = 3000

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
