import {
  Badge,
  Input,
  SettingsRow,
  SettingsSection,
  SettingsView,
  Switch,
  type PluginSettingsPanel,
  type SettingsPanelProps
} from '@xnetjs/ui'

// SettingsView is a full-page layout (`flex h-full`): a sidebar of sections
// (General / Appearance / Data / Network / Plugins) beside a scrollable content
// pane. We give it a fixed-height bordered frame so the shell is visible in the
// card, mirroring the Storybook fixture shape (built-in sections + a
// plugin-contributed panel).

function ExperimentalPanel({ storage }: SettingsPanelProps) {
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
    component: ExperimentalPanel
  }
]

const generalSection = (
  <SettingsSection title="Workspace Defaults" description="Set your preferred defaults.">
    <SettingsRow label="Workspace name" description="Appears in onboarding and shell chrome.">
      <Input defaultValue="xNet Lab" />
    </SettingsRow>
    <SettingsRow label="Autosave" description="Persist changes continuously.">
      <Switch checked />
    </SettingsRow>
    <SettingsRow label="Offline mode" description="Cache documents for local-first access.">
      <Switch />
    </SettingsRow>
  </SettingsSection>
)

export const Default = () => (
  <div className="h-[520px] overflow-hidden rounded-lg border border-border bg-background">
    <SettingsView pluginPanels={pluginPanels} sections={{ general: generalSection }} />
  </div>
)

const appearanceSection = (
  <SettingsSection title="Theme" description="Choose how the app looks.">
    <SettingsRow label="Use system theme" description="Follow the OS appearance setting.">
      <Switch checked />
    </SettingsRow>
    <SettingsRow label="Reduce motion" description="Minimize non-essential animation.">
      <Switch />
    </SettingsRow>
  </SettingsSection>
)

export const PluginsSection = () => (
  <div className="h-[520px] overflow-hidden rounded-lg border border-border bg-background">
    <SettingsView
      pluginPanels={pluginPanels}
      sections={{ general: generalSection, appearance: appearanceSection }}
      defaultSection="plugins"
    />
  </div>
)
