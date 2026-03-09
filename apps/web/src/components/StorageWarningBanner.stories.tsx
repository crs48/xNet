import type { Meta, StoryObj } from '@storybook/react-vite'
import { StorageWarningBanner } from './StorageWarningBanner'

const meta = {
  title: 'Web/StorageWarningBanner',
  component: StorageWarningBanner,
  parameters: {
    layout: 'fullscreen'
  },
  args: {
    tone: 'warning',
    title: 'Storage may be limited',
    message: 'Your browser did not grant persistent storage for this profile.',
    usageBytes: 73400320,
    quotaBytes: 268435456
  }
} satisfies Meta<typeof StorageWarningBanner>

export default meta

type Story = StoryObj<typeof meta>

export const Warning: Story = {}

export const Success: Story = {
  args: {
    tone: 'success',
    title: 'Durable local storage enabled',
    message: 'SQLite OPFS storage is available and persistent.'
  }
}

export const Informational: Story = {
  args: {
    tone: 'info',
    title: 'Storage durability unavailable',
    message: 'The browser supports local data, but durability guarantees are limited.',
    usageBytes: undefined,
    quotaBytes: undefined
  }
}
