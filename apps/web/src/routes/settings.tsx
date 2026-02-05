/**
 * Settings page - expanded with theme, data, and about sections
 */
import { createFileRoute } from '@tanstack/react-router'
import { useIdentity } from '@xnet/react'
import { Palette, Database, Info, ChevronRight, Sun, Moon, Monitor, Download } from 'lucide-react'
import { useState, useCallback } from 'react'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

type SettingsSection = 'appearance' | 'data' | 'about'

interface SectionConfig {
  id: SettingsSection
  label: string
  icon: React.ReactNode
  description: string
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Palette size={18} />,
    description: 'Theme and display'
  },
  {
    id: 'data',
    label: 'Data',
    icon: <Database size={18} />,
    description: 'Storage and export'
  },
  {
    id: 'about',
    label: 'About',
    icon: <Info size={18} />,
    description: 'Version info'
  }
]

function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance')

  return (
    <div className="flex h-full -m-6">
      {/* Sidebar Navigation */}
      <nav className="w-[200px] border-r border-border p-4 space-y-1 bg-secondary">
        <h1 className="text-lg font-semibold px-3 py-2 mb-2">Settings</h1>
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
        {activeSection === 'appearance' && <AppearanceSettings />}
        {activeSection === 'data' && <DataSettings />}
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
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-1">Appearance</h2>
        <p className="text-sm text-muted-foreground">Customize how xNet looks</p>
      </div>

      <div className="space-y-4">
        <SettingRow label="Theme" description="Choose your preferred color scheme">
          <div className="flex gap-2">
            <ThemeButton
              icon={<Sun size={16} />}
              label="Light"
              active={theme === 'light'}
              onClick={() => handleThemeChange('light')}
            />
            <ThemeButton
              icon={<Moon size={16} />}
              label="Dark"
              active={theme === 'dark'}
              onClick={() => handleThemeChange('dark')}
            />
            <ThemeButton
              icon={<Monitor size={16} />}
              label="System"
              active={theme === 'system'}
              onClick={() => handleThemeChange('system')}
            />
          </div>
        </SettingRow>
      </div>
    </div>
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
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary border border-border hover:bg-accent'
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
      // Clear IndexedDB databases
      const databases = await indexedDB.databases()
      for (const db of databases) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name)
        }
      }

      // Clear localStorage
      localStorage.clear()

      setCleared(true)
      setConfirmClear(false)

      // Reload after a short delay
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err) {
      console.error('Failed to clear data:', err)
    } finally {
      setClearing(false)
    }
  }, [confirmClear])

  const handleCancelClear = useCallback(() => {
    setConfirmClear(false)
  }, [])

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-1">Data</h2>
        <p className="text-sm text-muted-foreground">Manage your local data</p>
      </div>

      <div className="space-y-4">
        <SettingRow label="Storage" description="Data is stored locally in your browser">
          <span className="text-sm text-muted-foreground">IndexedDB</span>
        </SettingRow>

        <SettingRow label="Export data" description="Download a backup of all your documents">
          <button
            onClick={handleExportData}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </SettingRow>

        <SettingRow
          label="Clear all data"
          description="Remove all documents, settings, and identity (cannot be undone)"
        >
          {cleared ? (
            <span className="text-sm text-green-500">Data cleared! Reloading...</span>
          ) : confirmClear ? (
            <div className="flex gap-2">
              <button
                onClick={handleCancelClear}
                className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                disabled={clearing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-50"
              >
                {clearing ? 'Clearing...' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleClearData}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 rounded-md text-sm transition-colors"
            >
              Clear Data
            </button>
          )}
        </SettingRow>
      </div>
    </div>
  )
}

// ─── About Settings ───────────────────────────────────────────────────────────

function AboutSettings() {
  const { identity } = useIdentity()

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-medium mb-1">About</h2>
        <p className="text-sm text-muted-foreground">Information about xNet</p>
      </div>

      <div className="space-y-4">
        <SettingRow label="Version" description="Current application version">
          <span className="text-sm font-mono">1.0.0</span>
        </SettingRow>

        <SettingRow label="Platform" description="Runtime environment">
          <span className="text-sm text-muted-foreground">Web (PWA)</span>
        </SettingRow>

        <SettingRow label="Built with" description="Core technologies">
          <span className="text-sm text-muted-foreground">xNet SDK + React</span>
        </SettingRow>
      </div>

      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-2">Your Identity</h3>
        <div className="bg-secondary p-3 rounded-lg">
          <label className="text-xs text-muted-foreground">DID (Decentralized Identifier)</label>
          <p className="font-mono text-xs mt-1 break-all text-foreground">
            {identity?.did || 'Not initialized'}
          </p>
        </div>
      </div>

      <div className="pt-4">
        <h3 className="text-sm font-medium mb-2">Links</h3>
        <div className="flex gap-3">
          <a
            href="https://xnet.fyi"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Website
          </a>
          <a
            href="https://github.com/xnetfyi/xnet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub
          </a>
          <a
            href="https://xnet.fyi/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Documentation
          </a>
        </div>
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
