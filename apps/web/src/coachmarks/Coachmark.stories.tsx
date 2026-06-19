import type { CoachTip } from './registry'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState } from 'react'
import { Coachmark } from './Coachmark'

/**
 * The first-run coachmark (exploration 0206). A non-modal card that points at
 * an anchor element. These stories mount a stand-in Rail button as the anchor
 * so you can see the real positioning + <Presence> entrance.
 */
const meta = {
  title: 'Web/Coachmark',
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Coachmark>

export default meta
type Story = StoryObj<typeof meta>

function Demo({ tip }: { tip: CoachTip }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => setAnchor(ref.current), [])

  return (
    <div className="min-h-[320px] bg-surface-0 p-8 text-ink-1">
      <div className="flex items-start gap-8">
        {/* A stand-in for a Rail button. */}
        <button
          ref={ref}
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-2"
        >
          ⌘K
        </button>
        <p className="max-w-md text-sm text-ink-3">
          The coachmark points at the button on the left. Click “Got it”, the ✕, or press Escape to
          dismiss it.
        </p>
      </div>
      {open && anchor && <Coachmark tip={tip} anchor={anchor} onDismiss={() => setOpen(false)} />}
    </div>
  )
}

export const CommandPalette: Story = {
  render: () => (
    <Demo
      tip={{
        id: 'home:command-palette@1',
        view: 'home',
        anchor: '#anchor',
        title: 'Find or do anything',
        body: 'Press ⌘K to jump to any doc, person, or command — your fastest way around xNet.',
        side: 'right'
      }}
    />
  )
}

export const BelowAnchor: Story = {
  render: () => (
    <Demo
      tip={{
        id: 'demo:below@1',
        view: 'home',
        anchor: '#anchor',
        title: 'Your CRM',
        body: 'Contacts, deals, and organizations live here. Drag a deal between lanes to update its stage.',
        side: 'bottom'
      }}
    />
  )
}
