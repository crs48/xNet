/**
 * SettingsView - Application settings panel
 *
 * Organized into sections: General, Appearance, Plugins, Data, Network
 */

import React, { useState } from 'react'
import { Settings, Palette, Puzzle, Database, Wifi, ChevronRight } from 'lucide-react'
import { PluginManager } from './PluginManager'

type SettingsSection = 'general' | 'appearance' | 'plugins' | 'data' | 'network'

interface SettingsSectionConfig {
  id: SettingsSection
  label: string
  icon: React.ReactNode
  description: string
}

const SECTIONS: SettingsSectionConfig[] = [
  {
    id: 'general',
    label: 'General',
    icon: <Settings size={18} />,
    description: 'Basic application settings'
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Palette size={18} />,
    description: 'Theme and display preferences'
  },
  {
    id: 'plugins',
    label: 'Plugins',
    icon: <Puzzle size={18} />,
    description: 'Manage extensions and plugins'
  },
  {
    id: 'data',
    label: 'Data',
    icon: <Database size={18} />,
    description: 'Storage and sync settings'
  },
  {
    id: 'network',
    label: 'Network',
    icon: <Wifi size={18} />,
    description: 'Connection and peer settings'
  }
]

interface SettingsViewProps {
  onClose: () => void
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('plugins')

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-xl font-semibold">Settings</h1>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="sr-only">Close</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <nav className="w-[220px] border-r border-border p-4 space-y-1">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                activeSection === section.id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <span className="flex-shrink-0">{section.icon}</span>
              <span className="flex-1 text-left">{section.label}</span>
              {activeSection === section.id && (
                <ChevronRight size={14} className="text-muted-foreground" />
              )}
            </button>
          ))}
        </nav>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {activeSection === 'general' && <GeneralSettings />}
          {activeSection === 'appearance' && <AppearanceSettings />}
          {activeSection === 'plugins' && <PluginManager />}
          {activeSection === 'data' && <DataSettings />}
          {activeSection === 'network' && <NetworkSettings />}
        </div>
      </div>
    </div>
  )
}

// ─── General Settings ─────────────────────────────────────────────────────────

function GeneralSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-1">General</h2>
        <p className="text-sm text-muted-foreground">Basic application settings</p>
      </div>

      <div className="space-y-4">
        <SettingRow label="Startup behavior" description="What to show when the app starts">
          <select className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm">
            <option>Last opened document</option>
            <option>Empty workspace</option>
            <option>Home page</option>
          </select>
        </SettingRow>

        <SettingRow label="Auto-save" description="Automatically save changes">
          <ToggleSwitch defaultChecked />
        </SettingRow>
      </div>
    </div>
  )
}

// ─── Appearance Settings ──────────────────────────────────────────────────────

function AppearanceSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-1">Appearance</h2>
        <p className="text-sm text-muted-foreground">Theme and display preferences</p>
      </div>

      <div className="space-y-4">
        <SettingRow label="Theme" description="Choose your preferred color scheme">
          <select className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm">
            <option>System</option>
            <option>Light</option>
            <option>Dark</option>
          </select>
        </SettingRow>

        <SettingRow label="Font size" description="Base font size for the editor">
          <select className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm">
            <option>Small (14px)</option>
            <option>Medium (16px)</option>
            <option>Large (18px)</option>
          </select>
        </SettingRow>

        <SettingRow label="Sidebar position" description="Where to show the sidebar">
          <select className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm">
            <option>Left</option>
            <option>Right</option>
          </select>
        </SettingRow>
      </div>
    </div>
  )
}

// ─── Data Settings ────────────────────────────────────────────────────────────

function DataSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-1">Data</h2>
        <p className="text-sm text-muted-foreground">Storage and sync settings</p>
      </div>

      <div className="space-y-4">
        <SettingRow label="Local storage" description="Data is stored locally using IndexedDB">
          <span className="text-sm text-muted-foreground">Browser storage</span>
        </SettingRow>

        <SettingRow label="Clear local data" description="Remove all local data (cannot be undone)">
          <button className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 rounded-md text-sm transition-colors">
            Clear Data
          </button>
        </SettingRow>

        <SettingRow label="Export data" description="Download a backup of your data">
          <button className="bg-secondary hover:bg-accent border border-border px-3 py-1.5 rounded-md text-sm transition-colors">
            Export
          </button>
        </SettingRow>
      </div>
    </div>
  )
}

// ─── Network Settings ─────────────────────────────────────────────────────────

function NetworkSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-1">Network</h2>
        <p className="text-sm text-muted-foreground">Connection and peer settings</p>
      </div>

      <div className="space-y-4">
        <SettingRow label="P2P sync" description="Enable peer-to-peer synchronization">
          <ToggleSwitch defaultChecked />
        </SettingRow>

        <SettingRow label="Signaling server" description="WebRTC signaling server URL">
          <input
            type="text"
            defaultValue="ws://localhost:4444"
            className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm w-[200px]"
          />
        </SettingRow>

        <SettingRow label="Local API" description="HTTP API for external integrations">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Port 31415</span>
            <ToggleSwitch defaultChecked />
          </div>
        </SettingRow>
      </div>
    </div>
  )
}

// ─── Shared Components ────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function ToggleSwitch({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked)

  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => setChecked(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
