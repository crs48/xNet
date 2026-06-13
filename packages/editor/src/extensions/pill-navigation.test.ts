/**
 * Page hashtag/mention pills navigate on click (exploration 0172) — the
 * read-side counterpart to the [[wikilink]] click plugin. Each pill emits an
 * `xnet://<type>/<id>` href that the app's handleNavigate routes.
 */
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HashtagExtension } from './hashtag/HashtagExtension'
import { TaskMentionExtension } from './task-metadata/TaskMentionExtension'

function clickFirst(editor: Editor, selector: string): boolean {
  const el = editor.view.dom.querySelector(selector)
  expect(el).not.toBeNull()
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', { value: el })
  let handled = false
  editor.view.someProp('handleClick', (handler) => {
    if (handled) return
    handled = handler(editor.view, 1, event) === true
  })
  return handled
}

describe('pill navigation', () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('navigates to the tag page when a hashtag pill is clicked', () => {
    const onNavigate = vi.fn()
    editor = new Editor({
      extensions: [StarterKit, HashtagExtension.configure({ onNavigate })]
    })
    editor.commands.setHashtag({ id: 'tag-launch', name: 'launch' })

    expect(clickFirst(editor, 'span[data-hashtag]')).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('xnet://tag/tag-launch')
  })

  it('navigates to the person dashboard when a mention pill is clicked', () => {
    const onNavigate = vi.fn()
    editor = new Editor({
      extensions: [StarterKit, TaskMentionExtension.configure({ onNavigate })]
    })
    editor.commands.setTaskMention({ id: 'did:key:z6MkAlice', label: 'Alice' })

    expect(clickFirst(editor, 'span[data-task-mention]')).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('xnet://person/did:key:z6MkAlice')
  })

  it('ignores clicks that are not on a pill', () => {
    const onNavigate = vi.fn()
    editor = new Editor({
      extensions: [StarterKit, HashtagExtension.configure({ onNavigate })]
    })
    editor.commands.setContent('<p>plain text</p>')
    expect(clickFirst(editor, 'p')).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
