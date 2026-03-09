import type { Meta, StoryObj } from '@storybook/react-vite'
import { PresenceAvatars } from './PresenceAvatars'

const meta = {
  title: 'Web/PresenceAvatars',
  component: PresenceAvatars,
  args: {
    presence: [
      {
        did: 'did:key:zAlice1234567890',
        color: '#38bdf8'
      },
      {
        did: 'did:key:zBob1234567890',
        color: '#f97316'
      },
      {
        did: 'did:key:zCara1234567890',
        color: '#22c55e'
      }
    ]
  }
} satisfies Meta<typeof PresenceAvatars>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: {
    presence: []
  }
}
