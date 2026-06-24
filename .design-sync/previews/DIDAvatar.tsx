import { DIDAvatar } from '@xnetjs/ui'

// DIDAvatar deterministically renders a GitHub-style identicon from a DID string.
const dids = [
  'did:key:z6Mkp5cs2f9TAzWQ7zA4CM6CwFo4wQ9Q9CX6JvB4a3Zr3r2B',
  'did:key:z6MksdbQ7j3ZVhQkQ7u4N8o6gPv6mP8Q3gW6hZ9pA2wR5d1C',
  'did:key:z6Mkf9Q6BzL7yXv2Y3c4R5q7P8s9T0u1V2w3X4y5Z6a7B8c9',
  'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
]

export const Default = () => (
  <div className="flex flex-wrap items-center gap-3">
    {dids.map((did) => (
      <DIDAvatar key={did} did={did} />
    ))}
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <DIDAvatar did={dids[0]} size={24} />
    <DIDAvatar did={dids[0]} size={32} />
    <DIDAvatar did={dids[0]} size={48} />
    <DIDAvatar did={dids[0]} size={64} />
  </div>
)

export const InRow = () => (
  <div className="max-w-md space-y-2">
    {[
      { did: dids[0], name: 'Chris Smothers', handle: '@chris' },
      { did: dids[1], name: 'Ada Okonkwo', handle: '@ada' },
      { did: dids[2], name: 'Mateo Rivera', handle: '@mateo' }
    ].map((person) => (
      <div
        key={person.did}
        className="flex items-center gap-3 rounded-lg border border-border bg-background-subtle p-3"
      >
        <DIDAvatar did={person.did} size={40} />
        <div className="text-sm">
          <p className="font-medium text-foreground">{person.name}</p>
          <p className="text-foreground-muted">{person.handle}</p>
        </div>
      </div>
    ))}
  </div>
)
