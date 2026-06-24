import { MarkdownContent } from '@xnetjs/ui'

const doc = `# Release notes

xNet **0.0.1** ships the shared \`@xnetjs/ui\` kit — primitives, composed
surfaces, and design tokens in one place.

## Highlights

- Monochrome, APCA-tuned token ramp with light/dark modes
- \`class-variance-authority\` variants across every primitive
- Keyboard-first command palette and menus

> Components render the same in Storybook, the app, and Claude Design.

See the [documentation](https://example.com/docs) or run \`pnpm -F @xnetjs/ui build\`.
`

export const Default = () => (
  <div className="max-w-prose">
    <MarkdownContent content={doc} />
  </div>
)

export const Compact = () => (
  <div className="max-w-prose">
    <MarkdownContent content={'Inline **bold**, _italic_, and `code` with a [link](https://example.com).'} />
  </div>
)
