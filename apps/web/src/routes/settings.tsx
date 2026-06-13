/**
 * Settings page — workbench-idiom shell (exploration 0179).
 *
 * Flat surfaces, hairline separators, a 13px type scale, and the Rail's
 * activity-bar active indicator (a 2px left bar, not a filled pill). Rows
 * and panels come from the shared settings kit in @xnetjs/ui; booleans use
 * the design-system <Switch>; data atoms (DID, version, hub URL) read mono.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useIdentity } from '@xnetjs/react'
import { SettingRow, SettingsGroup, SettingsPanel } from '@xnetjs/ui'
import {
  Palette,
  Database,
  Info,
  Sun,
  Moon,
  Monitor,
  Download,
  LogOut,
  Puzzle,
  User,
  UserRound,
  Wifi,
  ShieldCheck
} from 'lucide-react'
import { useState, useCallback } from 'react'
import { ProfileSettings } from '../comms/ProfileSettings'
import { ContentSafetySettings } from '../components/ContentSafetySettings'
import { PluginManager } from '../components/PluginManager'
import { SafetyCenterSettings } from '../components/SafetyCenterSettings'
import { requestXNetBrowserStorageReset } from '../lib/browser-storage-reset'
import { logout } from '../lib/identity'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

type SettingsSection =
  | 'profile'
  | 'appearance'
  | 'safety'
  | 'data'
  | 'network'
  | 'plugins'
  | 'account'
  | 'about'

interface SectionConfig {
  id: SettingsSection
  label: string
  icon: React.ReactNode
}

/** Quiet bordered button — the workbench's default action affordance. */
const QUIET_BUTTON =
  'flex items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2 disabled:cursor-default disabled:opacity-50'

const ICON_PROPS = { size: 16, strokeWidth: 1.5 } as const

const SECTIONS: SectionConfig[] = [
  { id: 'profile', label: 'Profile', icon: <UserRound {...ICON_PROPS} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette {...ICON_PROPS} /> },
  { id: 'safety', label: 'Content & Safety', icon: <ShieldCheck {...ICON_PROPS} /> },
  { id: 'data', label: 'Data', icon: <Database {...ICON_PROPS} /> },
  { id: 'network', label: 'Network', icon: <Wifi {...ICON_PROPS} /> },
  { id: 'plugins', label: 'Plugins', icon: <Puzzle {...ICON_PROPS} /> },
  { id: 'account', label: 'Account', icon: <User {...ICON_PROPS} /> },
  { id: 'about', label: 'About', icon: <Info {...ICON_PROPS} /> }
]

function NavItem({
  section,
  active,
  onClick
}: {
  section: SectionConfig
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`relative flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
        active ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1'
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-accent-ink" />}
      <span className="flex-shrink-0">{section.icon}</span>
      <span className="flex-1 text-left">{section.label}</span>
    </button>
  )
}

function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance')

  return (
    <div className="-m-6 flex h-full">
      {/* Sidebar Navigation */}
      <nav className="w-[200px] shrink-0 space-y-0.5 border-r border-hairline bg-surface-1 p-2">
        <h1 className="px-3 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          Settings
        </h1>
        {SECTIONS.map((section) => (
          <NavItem
            key={section.id}
            section={section}
            active={activeSection === section.id}
            onClick={() => setActiveSection(section.id)}
          />
        ))}
      </nav>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-surface-0 p-6">
        {activeSection === 'profile' && <ProfileSettings />}
        {activeSection === 'appearance' && <AppearanceSettings />}
        {activeSection === 'safety' && (
          <div className="space-y-10">
            <ContentSafetySettings />
            <SafetyCenterSettings />
          </div>
        )}
        {activeSection === 'data' && <DataSettings />}
        {activeSection === 'network' && <NetworkSettings />}
        {activeSection === 'plugins' && <PluginManager />}
        {activeSection === 'account' && <AccountSettings />}
        {activeSection === 'about' && <AboutSettings />}
      </div>
    </div>
  )
}

// ─── Appearance Settings ──────────────────────────────────────────────────────

type Theme = 'light' | 'dark' | 'system'

function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    return (localStorage.getItem('xnet:theme') as Theme) || 'system'
  })

  const handleThemeChange = useCallback((newTheme: Theme) => {
    setTheme(newTheme)
    localStorage.setItem('xnet:theme', newTheme)

    // Apply theme to document
    const root = document.documentElement
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    } else {
      root.classList.toggle('dark', newTheme === 'dark')
    }
  }, [])

  return (
    <SettingsPanel title="Appearance" description="Customize how xNet looks">
      <SettingsGroup>
        <SettingRow label="Theme" description="Choose your preferred color scheme">
          <div className="flex gap-1.5">
            <ThemeButton
              icon={<Sun size={14} strokeWidth={1.5} />}
              label="Light"
              active={theme === 'light'}
              onClick={() => handleThemeChange('light')}
            />
            <ThemeButton
              icon={<Moon size={14} strokeWidth={1.5} />}
              label="Dark"
              active={theme === 'dark'}
              onClick={() => handleThemeChange('dark')}
            />
            <ThemeButton
              icon={<Monitor size={14} strokeWidth={1.5} />}
              label="System"
              active={theme === 'system'}
              onClick={() => handleThemeChange('system')}
            />
          </div>
        </SettingRow>
      </SettingsGroup>
    </SettingsPanel>
  )
}

function ThemeButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? 'border-accent-ink bg-accent text-ink-1'
          : 'border-hairline bg-surface-0 text-ink-2 hover:bg-surface-2 hover:text-ink-1'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// ─── Data Settings ────────────────────────────────────────────────────────────

function DataSettings() {
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExportData = useCallback(async () => {
    setExporting(true)
    try {
      const databases = await indexedDB.databases()
      const exportData: {
        exportedAt: string
        version: string
        databases: Record<string, Record<string, unknown[]>>
      } = {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        databases: {}
      }

      // Export each database
      for (const dbInfo of databases) {
        if (!dbInfo.name) continue

        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(dbInfo.name!)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })

        const dbExport: Record<string, unknown[]> = {}

        for (const storeName of Array.from(db.objectStoreNames)) {
          const tx = db.transaction(storeName, 'readonly')
          const store = tx.objectStore(storeName)
          const items = await new Promise<unknown[]>((resolve, reject) => {
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          dbExport[storeName] = items
        }

        exportData.databases[dbInfo.name] = dbExport
        db.close()
      }

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `xnet-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export data:', err)
    } finally {
      setExporting(false)
    }
  }, [])

  const handleClearData = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }

    setClearing(true)
    try {
      requestXNetBrowserStorageReset()
      setCleared(true)
      setConfirmClear(false)
    } catch (err) {
      console.error('Failed to clear data:', err)
      setClearing(false)
    }
  }, [confirmClear])

  const handleCancelClear = useCallback(() => {
    setConfirmClear(false)
  }, [])

  return (
    <SettingsPanel title="Data" description="Manage your local data">
      <SettingsGroup>
        <SettingRow label="Storage" description="Data is stored locally in your browser">
          <span className="font-mono text-xs text-ink-3">SQLite OPFS</span>
        </SettingRow>

        <SettingRow label="Export data" description="Download a backup of all your documents">
          <button onClick={handleExportData} disabled={exporting} className={QUIET_BUTTON}>
            <Download size={14} strokeWidth={1.5} />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </SettingRow>

        <SettingRow
          label="Clear all data"
          description="Remove all documents, settings, and identity (cannot be undone)"
        >
          {cleared ? (
            <span className="text-xs text-success">Data cleared! Reloading…</span>
          ) : confirmClear ? (
            <div className="flex gap-2">
              <button onClick={handleCancelClear} className={QUIET_BUTTON}>
                Cancel
              </button>
              <button
                onClick={handleClearData}
                disabled={clearing}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground transition-colors hover:bg-destructive-hover disabled:opacity-50"
              >
                {clearing ? 'Clearing…' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleClearData}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground transition-colors hover:bg-destructive-hover"
            >
              Clear Data
            </button>
          )}
        </SettingRow>
      </SettingsGroup>
    </SettingsPanel>
  )
}

// ─── Network Settings ──────────────────────────────────────────────────────────

const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL || 'wss://hub.xnet.fyi'

function NetworkSettings() {
  const [hubUrl, setHubUrl] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_HUB_URL
    return localStorage.getItem('xnet:hub-url') || DEFAULT_HUB_URL
  })
  const [saved, setSaved] = useState(false)

  const handleSave = useCallback(() => {
    localStorage.setItem('xnet:hub-url', hubUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [hubUrl])

  const handleReset = useCallback(() => {
    setHubUrl(DEFAULT_HUB_URL)
    localStorage.removeItem('xnet:hub-url')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  const isModified = hubUrl !== DEFAULT_HUB_URL

  return (
    <SettingsPanel title="Network" description="Configure sync and connectivity">
      <SettingsGroup>
        <div className="border-b border-hairline py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm text-ink-1">Hub URL</div>
              <div className="text-xs text-ink-3">WebSocket server for peer discovery and sync</div>
            </div>
            {saved && <span className="text-xs text-success">Saved! Reload to apply.</span>}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={hubUrl}
              onChange={(e) => setHubUrl(e.target.value)}
              placeholder="wss://hub.xnet.fyi"
              className="h-8 flex-1 rounded-md border border-hairline bg-surface-0 px-2 font-mono text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
            />
            <button onClick={handleSave} className={QUIET_BUTTON}>
              Save
            </button>
            {isModified && (
              <button onClick={handleReset} className={QUIET_BUTTON}>
                Reset
              </button>
            )}
          </div>
        </div>

        <SettingRow label="Protocol" description="Connection type used for sync">
          <span className="text-xs text-ink-3">WebSocket + WebRTC</span>
        </SettingRow>

        <SettingRow label="Encryption" description="All sync traffic is encrypted">
          <span className="text-xs text-ink-3">XChaCha20-Poly1305</span>
        </SettingRow>
      </SettingsGroup>

      <p className="text-xs text-ink-3">
        Changes to the Hub URL require reloading the app to take effect. The default hub at{' '}
        <code className="font-mono">hub.xnet.fyi</code> is provided for convenience, but you can run
        your own signaling server.
      </p>
    </SettingsPanel>
  )
}

// ─── Account Settings ─────────────────────────────────────────────────────────

function AccountSettings() {
  const { identity } = useIdentity()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch (err) {
      console.error('Failed to log out:', err)
      setLoggingOut(false)
    }
  }, [])

  return (
    <SettingsPanel title="Account" description="Your identity and session on this device">
      <SettingsGroup>
        <SettingRow label="Identity" description="Your decentralized identifier (DID)">
          <span className="max-w-[280px] break-all font-mono text-[10px] text-ink-3">
            {identity?.did || 'Not initialized'}
          </span>
        </SettingRow>

        <SettingRow
          label="Log out"
          description="Ends your session on this device. Your data stays local — sign back in with your passkey."
        >
          <button onClick={handleLogout} disabled={loggingOut} className={QUIET_BUTTON}>
            <LogOut size={14} strokeWidth={1.5} />
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </SettingRow>
      </SettingsGroup>
    </SettingsPanel>
  )
}

// ─── About Settings ───────────────────────────────────────────────────────────

function AboutSettings() {
  const { identity } = useIdentity()

  return (
    <SettingsPanel title="About" description="Information about xNet">
      <SettingsGroup>
        <SettingRow label="Version" description="Current application version">
          <span className="font-mono text-xs text-ink-1">1.0.0</span>
        </SettingRow>

        <SettingRow label="Platform" description="Runtime environment">
          <span className="text-xs text-ink-3">Web (PWA)</span>
        </SettingRow>

        <SettingRow label="Built with" description="Core technologies">
          <span className="text-xs text-ink-3">xNet SDK + React</span>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup label="Your identity">
        <div className="rounded-md border border-hairline bg-surface-1 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
            DID (Decentralized Identifier)
          </div>
          <p className="mt-1 break-all font-mono text-[10px] text-ink-1">
            {identity?.did || 'Not initialized'}
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup label="Links">
        <div className="flex gap-3">
          <a href="https://xnet.fyi" target="_blank" rel="noopener noreferrer" className="text-xs">
            Website
          </a>
          <a
            href="https://github.com/xnetfyi/xnet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
          >
            GitHub
          </a>
          <a
            href="https://xnet.fyi/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
          >
            Documentation
          </a>
        </div>
      </SettingsGroup>
    </SettingsPanel>
  )
}
