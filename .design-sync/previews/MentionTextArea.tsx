import { MentionTextArea } from '@xnetjs/ui'

// Plain textarea with @mention typeahead. Text is the single source of truth; an inserted
// mention is the DID form (@did:key:…). No React state in previews, so we show a static
// value that already contains a mention (the menu only opens on live typing).
const people = [
  { did: 'did:key:z6MkChris', name: 'Chris', isSelf: true },
  { did: 'did:key:z6MkPat', name: 'Pat' },
  { did: 'did:key:z6MkMorgan', name: 'Morgan' },
  { did: 'did:key:z6MkAvery', name: 'Avery' }
]

export const WithMention = () => (
  <div className="max-w-md space-y-2">
    <label className="text-sm font-medium text-foreground">Reply</label>
    <MentionTextArea
      value="Thanks @did:key:z6MkPat — let's keep the Storybook surface dev-only for now."
      onChange={() => undefined}
      people={people}
      placeholder="Reply… use @ to mention someone"
      rows={3}
      className="rounded-md border border-border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
  </div>
)

export const Empty = () => (
  <div className="max-w-md space-y-2">
    <label className="text-sm font-medium text-foreground">Add a comment</label>
    <MentionTextArea
      value=""
      onChange={() => undefined}
      people={people}
      placeholder="Add a comment… use @ to mention someone"
      rows={3}
      className="rounded-md border border-border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
  </div>
)
