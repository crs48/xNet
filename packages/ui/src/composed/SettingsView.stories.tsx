import type { PluginSettingsPanel, SettingsPanelProps } from './SettingsView'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactElement } from 'react'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Input } from '../primitives/Input'
import { Switch } from '../primitives/Switch'
import { SettingsRow, SettingsSection, SettingsView } from './SettingsView'

function ExamplePluginPanel({ storage }: SettingsPanelProps): ReactElement {
  const enabled = storage.get<boolean>('enabled') ?? true

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div>
          <p className="text-sm font-medium">Experimental mode</p>
          <p className="text-xs text-muted-foreground">
            Stored through the SettingsView plugin storage contract.
          </p>
        </div>
        <Badge variant="outline">{enabled ? 'Enabled' : 'Disabled'}</Badge>
      </div>
      <Button type="button" variant="outline" onClick={() => storage.set('enabled', !enabled)}>
        Toggle stored value
      </Button>
    </div>
  )
}

const pluginPanels: PluginSettingsPanel[] = [
  {
    id: 'plugin-example',
    title: 'Example Plugin',
    description: 'Demonstrates a plugin-contributed settings panel.',
    icon: 'puzzle',
    section: 'plugins',
    component: ExamplePluginPanel
  }
]

const meta = {
  title: 'UI/Composed/SettingsView',
  component: SettingsView,
  parameters: {
    layout: 'fullscreen'
  },
  args: {
    pluginPanels,
    sections: {
      general: (
        <SettingsSection title="Workspace Defaults" description="Set your preferred defaults.">
          <SettingsRow
            label="Workspace name"
            description="This appears in onboarding and shell chrome."
          >
            <Input defaultValue="xNet Lab" />
          </SettingsRow>
          <SettingsRow label="Autosave" description="Persist changes continuously.">
            <Switch checked />
          </SettingsRow>
        </SettingsSection>
      ),
      appearance: (
        <SettingsSection title="Theme" description="Choose how the app looks in development.">
          <SettingsRow label="Use system theme" description="Follow the OS appearance setting.">
            <Switch checked />
          </SettingsRow>
        </SettingsSection>
      )
    }
  }
} satisfies Meta<typeof SettingsView>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const PluginsSection: Story = {
  args: {
    defaultSection: 'plugins'
  }
}
