import type { Meta, StoryObj } from '@storybook/react-vite'
import { Download, Plus, Trash2 } from 'lucide-react'
import { Button } from './Button'

const meta = {
  title: 'UI/Primitives/Button',
  component: Button,
  args: {
    children: 'Save changes',
    variant: 'default',
    size: 'default'
  },
  argTypes: {
    leftIcon: { control: false },
    rightIcon: { control: false },
    onClick: { action: 'clicked' }
  }
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="link">Link action</Button>
    </div>
  )
}

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button leftIcon={<Plus />}>New page</Button>
      <Button variant="outline" rightIcon={<Download />}>
        Export
      </Button>
      <Button variant="destructive" leftIcon={<Trash2 />}>
        Remove
      </Button>
    </div>
  )
}

export const Loading: Story = {
  args: {
    loading: true,
    children: 'Saving'
  }
}
