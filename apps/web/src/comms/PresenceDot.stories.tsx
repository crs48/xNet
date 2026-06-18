import type { Meta, StoryObj } from '@storybook/react-vite'
import type { PresenceStatus } from '@xnetjs/comms'
import { PresenceDot } from './PresenceDot'

/**
 * Story coverage for the chat building blocks (exploration 0200): the chat
 * surface itself only renders behind the parameterized /channel/$channelId
 * route, but its primitives render from plain props, so a co-located story
 * gives the visual-capture pipeline a stable, seed-free baseline to diff.
 */
const meta = {
  title: 'Web/Comms/PresenceDot',
  component: PresenceDot,
  args: { status: 'active', ring: true }
} satisfies Meta<typeof PresenceDot>

export default meta

type Story = StoryObj<typeof meta>

export const Active: Story = {}

const STATUSES: (PresenceStatus | undefined)[] = ['active', 'idle', 'dnd', undefined]

export const AllStatuses: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      {STATUSES.map((status) => (
        <div key={status ?? 'offline'} className="flex flex-col items-center gap-2">
          <PresenceDot status={status} />
          <span className="text-xs text-ink-3">{status ?? 'offline'}</span>
        </div>
      ))}
    </div>
  )
}
