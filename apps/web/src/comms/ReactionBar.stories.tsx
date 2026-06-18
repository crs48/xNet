import type { ProfileEntry } from './hooks'
import type { ReactionGroup } from './reactions'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReactionBar } from './ReactionBar'

/**
 * Story coverage for the chat building blocks (exploration 0200). ReactionBar
 * renders from plain props (reaction groups + profiles), so it gives the
 * visual-capture pipeline a stable, seed-free baseline for the emoji reaction
 * pills that PR #174 shipped — without booting the app or seeding a channel.
 */
const PROFILES: ProfileEntry[] = [
  { did: 'did:key:zAlice', name: 'Alice' },
  { did: 'did:key:zBob', name: 'Bob' },
  { did: 'did:key:zCara', name: 'Cara' }
]

const GROUPS: ReactionGroup[] = [
  { emoji: '👍', count: 3, mine: true, myReactionId: 'r1', reactors: PROFILES.map((p) => p.did) },
  { emoji: '🎉', count: 1, mine: false, reactors: ['did:key:zBob'] },
  { emoji: '🚀', count: 2, mine: false, reactors: ['did:key:zAlice', 'did:key:zCara'] }
]

const meta = {
  title: 'Web/Comms/ReactionBar',
  component: ReactionBar,
  args: { groups: GROUPS, profiles: PROFILES, onToggle: () => {} }
} satisfies Meta<typeof ReactionBar>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SingleReaction: Story = {
  args: {
    groups: [
      { emoji: '❤️', count: 1, mine: true, myReactionId: 'r9', reactors: ['did:key:zAlice'] }
    ]
  }
}
