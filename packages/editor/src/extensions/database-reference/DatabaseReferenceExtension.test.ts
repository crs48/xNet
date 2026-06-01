import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseReferenceExtension } from './DatabaseReferenceExtension'

describe('DatabaseReferenceExtension', () => {
  let editor: Editor
  const onOpenDatabase = vi.fn()

  beforeEach(() => {
    onOpenDatabase.mockClear()
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit,
        DatabaseReferenceExtension.configure({
          onOpenDatabase
        })
      ],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  it('registers an inline atom node type', () => {
    const spec = editor.schema.nodes.databaseReference.spec

    expect(spec.group).toBe('inline')
    expect(spec.inline).toBe(true)
    expect(spec.atom).toBe(true)
  })

  it('inserts a compact database reference chip', () => {
    expect(
      editor.commands.setDatabaseReference({
        databaseId: 'db-roadmap',
        title: 'Roadmap Database'
      })
    ).toBe(true)

    const paragraph = editor.getJSON().content?.find((node) => node.type === 'paragraph')
    const reference = paragraph?.content?.find((node) => node.type === 'databaseReference')

    expect(reference?.attrs).toMatchObject({
      databaseId: 'db-roadmap',
      title: 'Roadmap Database',
      icon: 'DB'
    })
  })

  it('renders database references as accessible inline links', () => {
    editor.commands.setContent('<p></p>')
    editor.commands.setDatabaseReference({
      databaseId: 'db-roadmap',
      title: 'Roadmap Database'
    })

    const html = editor.getHTML()

    expect(html).toContain('data-database-reference')
    expect(html).toContain('data-database-id="db-roadmap"')
    expect(html).toContain('href="xnet://database/db-roadmap"')
    expect(html).toContain('aria-label="Database Roadmap Database"')
    expect(html).toContain('class="database-reference"')
  })

  it('opens the referenced database on click', () => {
    const anchor = document.createElement('a')
    const event = {
      target: anchor,
      preventDefault: vi.fn()
    } as unknown as MouseEvent
    const plugin = editor.state.plugins.find((item) =>
      String((item as { key?: string }).key).includes('databaseReferenceClick')
    )

    anchor.setAttribute('data-database-reference', '')
    anchor.setAttribute('data-database-id', 'db-roadmap')

    const handled = plugin?.props.handleClick?.(editor.view, 0, event)

    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(onOpenDatabase).toHaveBeenCalledWith('db-roadmap')
  })

  it('rejects empty database ids', () => {
    expect(editor.commands.setDatabaseReference({ databaseId: '   ' })).toBe(false)
  })
})
