/**
 * Catalog for the wireframe kit (exploration 0403).
 *
 * Doubles as the a11y surface: `@storybook/addon-a11y` runs against these
 * stories, so a regression in the kit's contrast or semantics fails here rather
 * than inside somebody's exploration companion.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import React from 'react'
import { Screen } from './Screen'

const meta = {
  title: 'UI/Wireframe/Screen',
  component: Screen,
  parameters: { layout: 'centered' }
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/** Every helper class and bare element the kit themes. */
export const Vocabulary: Story = {
  args: { surface: 'panel', label: 'Every primitive the kit provides' },
  render: (args) => (
    <Screen {...args}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px' }}>
        <h1>Heading one</h1>
        <h2>Heading two</h2>
        <p>Body copy sits on the paper plane.</p>
        <p className="wf-muted">Muted secondary text.</p>
        <hr />
        <div style={{ display: 'flex', gap: '6px' }}>
          <span className="wf-pill accent">Accent pill</span>
          <span className="wf-pill">Plain pill</span>
        </div>
        <div className="wf-card">
          <p>A card on the island plane.</p>
          <p className="wf-muted">4 open · updated 2h ago</p>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          Email
          <input type="email" defaultValue="jane@example.com" />
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="primary">Primary</button>
          <button>Secondary</button>
        </div>
        <a href="#top">A link</a>
      </div>
    </Screen>
  )
}

/** Icon markers swap to real SVGs; an unknown name warns and stays visible. */
export const IconMarkers: Story = {
  args: { surface: 'popover', label: 'data-icon markers' },
  render: (args) => (
    <Screen {...args}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
        {['search', 'mail', 'lock', 'calendar', 'settings'].map((name) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span data-icon={name} aria-label={name} />
            <span className="wf-muted">{name}</span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

/** Each footprint, so a wrong `surface` is obvious at a glance. */
export const Surfaces: Story = {
  args: { surface: 'panel' },
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {(['popover', 'panel', 'mobile'] as const).map((surface) => (
        <Screen key={surface} surface={surface} label={`surface="${surface}"`}>
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <h2>{surface}</h2>
            <p className="wf-muted">Matched to the real footprint.</p>
          </div>
        </Screen>
      ))}
    </div>
  )
}
