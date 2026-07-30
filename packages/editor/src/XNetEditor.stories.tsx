/**
 * XNetEditor stories (0312) — the BlockNote-based editor against an
 * in-memory Y.Doc, exercising the xNet schema specs.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as Y from 'yjs'
import { XNetEditor } from './blocknote/XNetEditor'
import type { HashtagSuggestion } from './blocknote/specs/hashtag'
import type { TaskMentionSuggestion } from './blocknote/specs/mention'
import type { WikilinkTarget } from './blocknote/specs/wikilink'

const meta: Meta<typeof XNetEditor> = {
  title: 'Editor/XNetEditor',
  component: XNetEditor,
  parameters: { layout: 'fullscreen' }
}
export default meta

type Story = StoryObj<typeof XNetEditor>

const MENTIONS: TaskMentionSuggestion[] = [
  { id: 'did:key:z6MkAda', label: 'Ada Lovelace', handle: 'ada', subtitle: 'Engineering' },
  { id: 'did:key:z6MkGrace', label: 'Grace Hopper', handle: 'grace', subtitle: 'Compilers' }
]

const HASHTAGS: HashtagSuggestion[] = [
  { id: 'tag-urgent', name: 'urgent' },
  { id: 'tag-design', name: 'design' }
]

const LINK_TARGETS: WikilinkTarget[] = [
  { href: 'page-roadmap', title: 'Roadmap', kind: 'page' },
  { href: 'page-handbook', title: 'Handbook', kind: 'page' }
]

function freshDoc(): Y.Doc {
  return new Y.Doc()
}

export const Empty: Story = {
  render: () => (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <XNetEditor
        ydoc={freshDoc()}
        did="did:key:z6MkStoryUser"
        userLabel="Story User"
        mentionSuggestions={MENTIONS}
        hashtagSuggestions={HASHTAGS}
        linkTargets={LINK_TARGETS}
        placeholder="Type '/' for blocks, '@' to mention, '#' to tag, '[[' to link…"
      />
    </div>
  )
}

export const ReadOnly: Story = {
  render: () => {
    const ydoc = freshDoc()
    return (
      <div style={{ maxWidth: 720, margin: '2rem auto' }}>
        <XNetEditor ydoc={ydoc} readOnly placeholder="Read-only surface" />
      </div>
    )
  }
}

export const LegacyImport: Story = {
  render: () => {
    // A v3 (TipTap-schema) fragment that the lazy importer converts on mount.
    const ydoc = freshDoc()
    const legacy = ydoc.getXmlFragment('content')
    const heading = new Y.XmlElement('heading')
    heading.setAttribute('level', '2')
    const headingText = new Y.XmlText()
    headingText.insert(0, 'Imported from the old editor')
    heading.insert(0, [headingText])
    const para = new Y.XmlElement('paragraph')
    const paraText = new Y.XmlText()
    paraText.insert(0, 'This paragraph lived in the legacy content fragment.')
    para.insert(0, [paraText])
    legacy.insert(0, [heading, para])
    return (
      <div style={{ maxWidth: 720, margin: '2rem auto' }}>
        <XNetEditor ydoc={ydoc} />
      </div>
    )
  }
}
