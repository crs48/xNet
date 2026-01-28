/**
 * Settings View
 *
 * A settings panel with sections and plugin extension points.
 */

import { useState, useMemo, type ReactNode, type ComponentType } from 'react'
import * as icons from 'lucide-react'
import { cn } from '../utils'
import { ScrollArea } from '../primitives/ScrollArea'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Built-in settings section identifiers
 */
export type SettingsSection = 'general' | 'appearance' | 'data' | 'network' | 'plugins'

/**
 * Settings panel props passed to plugin settings components
 */
export interface SettingsPanelProps {
  /** Plugin's key-value storage */
  storage: {
    get: <T>(key: string) => T | undefined
    set: <T>(key: string, value: T) => void
    keys: () => string[]
  }
}

/**
 * Plugin settings contribution
 */
export interface PluginSettingsPanel {
  /** Unique panel ID */
  id: string
  /** Panel title */
  title: string
  /** Optional description */
  description?: string
  /** Icon name (Lucide) */
  icon?: string
  /** Which section this belongs to */
  section?: SettingsSection
  /** The settings panel component */
  component: ComponentType<SettingsPanelProps>
}

/**
 * Section definition
 */
interface SectionDef {
  id: SettingsSection
  title: string
  icon: ComponentType<{ className?: string }>
}

/**
 * Props for SettingsView
 */
export interface SettingsViewProps {
  /** Plugin-contributed settings panels */
  pluginPanels?: PluginSettingsPanel[]
  /** Storage factory for plugin settings */
  getPluginStorage?: (pluginId: string) => SettingsPanelProps['storage']
  /** Content for built-in sections */
  sections?: {
    general?: ReactNode
    appearance?: ReactNode
    data?: ReactNode
    network?: ReactNode
    plugins?: ReactNode
  }
  /** Initial active section */
  defaultSection?: SettingsSection
  /** Callback when section changes */
  onSectionChange?: (section: SettingsSection) => void
  /** Additional class name */
  className?: string
}

// ─── Section Definitions ─────────────────────────────────────────────────────

const SECTIONS: SectionDef[] = [
  { id: 'general', title: 'General', icon: icons.Settings },
  { id: 'appearance', title: 'Appearance', icon: icons.Palette },
  { id: 'data', title: 'Data & Storage', icon: icons.Database },
  { id: 'network', title: 'Network', icon: icons.Globe },
  { id: 'plugins', title: 'Plugins', icon: icons.Puzzle }
]

// ─── Default Storage ─────────────────────────────────────────────────────────

const defaultStorage: SettingsPanelProps['storage'] = {
  get: () => undefined,
  set: () => {},
  keys: () => []
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Settings view component with sections and plugin panels
 *
 * @example
 * ```tsx
 * <SettingsView
 *   pluginPanels={useContributions('settings')}
 *   getPluginStorage={(id) => createPluginStorage(id)}
 *   sections={{
 *     general: <GeneralSettings />,
 *     appearance: <AppearanceSettings />
 *   }}
 * />
 * ```
 */
export function SettingsView({
  pluginPanels = [],
  getPluginStorage = () => defaultStorage,
  sections = {},
  defaultSection = 'general',
  onSectionChange,
  className
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(defaultSection)

  // Group plugin panels by section
  const panelsBySection = useMemo(() => {
    const grouped: Record<SettingsSection, PluginSettingsPanel[]> = {
      general: [],
      appearance: [],
      data: [],
      network: [],
      plugins: []
    }

    for (const panel of pluginPanels) {
      const section = panel.section ?? 'plugins'
      grouped[section].push(panel)
    }

    return grouped
  }, [pluginPanels])

  const handleSectionChange = (section: SettingsSection) => {
    setActiveSection(section)
    onSectionChange?.(section)
  }

  return (
    <div className={cn('flex h-full bg-background', className)}>
      {/* Sidebar navigation */}
      <aside className="w-56 border-r border-border bg-secondary/30">
        <div className="p-4">
          <h2 className="text-lg font-semibold">Settings</h2>
        </div>
        <nav className="px-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            const hasPluginPanels = panelsBySection[section.id].length > 0

            return (
              <button
                key={section.id}
                onClick={() => handleSectionChange(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{section.title}</span>
                {hasPluginPanels && (
                  <span className="text-xs opacity-50">+{panelsBySection[section.id].length}</span>
                )}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Content area */}
      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="max-w-2xl mx-auto p-6">
            {/* Section header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">
                {SECTIONS.find((s) => s.id === activeSection)?.title}
              </h1>
            </div>

            {/* Built-in section content */}
            {sections[activeSection] && <div className="mb-8">{sections[activeSection]}</div>}

            {/* Plugin panels for this section */}
            {panelsBySection[activeSection].map((panel) => (
              <PluginPanel key={panel.id} panel={panel} storage={getPluginStorage(panel.id)} />
            ))}

            {/* Empty state for sections with no content */}
            {!sections[activeSection] && panelsBySection[activeSection].length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <icons.Settings className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No settings available for this section</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}

// ─── Plugin Panel ────────────────────────────────────────────────────────────

interface PluginPanelProps {
  panel: PluginSettingsPanel
  storage: SettingsPanelProps['storage']
}

function PluginPanel({ panel, storage }: PluginPanelProps) {
  const PanelComponent = panel.component

  // Resolve icon
  let IconComponent: ComponentType<{ className?: string }> | null = null
  if (panel.icon) {
    const iconName = panel.icon
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IconComponent = (icons as any)[iconName] ?? icons.Puzzle
  }

  return (
    <div className="mb-6 p-4 border border-border rounded-lg bg-card">
      {/* Panel header */}
      <div className="flex items-start gap-3 mb-4">
        {IconComponent && (
          <div className="p-2 rounded-md bg-primary/10">
            <IconComponent className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-medium">{panel.title}</h3>
          {panel.description && (
            <p className="text-sm text-muted-foreground mt-1">{panel.description}</p>
          )}
        </div>
      </div>

      {/* Panel content */}
      <div className="pl-0">
        <PanelComponent storage={storage} />
      </div>
    </div>
  )
}

// ─── Settings Components ─────────────────────────────────────────────────────

/**
 * Settings section wrapper
 */
export function SettingsSection({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  )
}

/**
 * Settings row with label and control
 */
export function SettingsRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1">
        <label className="text-sm font-medium">{label}</label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}
