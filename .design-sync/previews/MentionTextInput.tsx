import { ThemeProvider, MentionTextInput } from '@xnetjs/ui'

const people = [
  { did: 'did:key:z6MkpAliceSyncEngine', name: 'Alice Nguyen', isSelf: true },
  { did: 'did:key:z6MkpBobProtocol', name: 'Bob Mercer' },
  { did: 'did:key:z6MkpCarolSec', name: 'Carol Diaz' }
]

const tags = [
  { id: 'tag_sync', name: 'sync' },
  { id: 'tag_protocol', name: 'protocol' }
]

const noop = () => undefined

// The mention menu is caret-driven, so a static card shows the field chrome
// with realistic title text — including an @mention and a #tag token.
export const WithMention = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-md rounded-lg border border-border bg-background p-3">
      <MentionTextInput
        value="Wire change-log replay @Bob #sync"
        onChange={noop}
        people={people}
        onMention={noop}
        tags={tags}
        onTag={noop}
        placeholder="Task title"
      />
    </div>
  </ThemeProvider>
)

export const Empty = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-md rounded-lg border border-border bg-background p-3">
      <MentionTextInput
        value=""
        onChange={noop}
        people={people}
        onMention={noop}
        placeholder="Add a task… type @ to assign, # to tag"
      />
    </div>
  </ThemeProvider>
)

export const Filled = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-md rounded-lg border border-border bg-background p-3">
      <MentionTextInput
        value="Rotate hub signing keys before the cert expires"
        onChange={noop}
        people={people}
        onMention={noop}
        placeholder="Task title"
      />
    </div>
  </ThemeProvider>
)
