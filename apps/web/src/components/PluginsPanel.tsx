/**
 * PluginsPanel — the Settings → Plugins section (exploration 0201).
 *
 * Two tabs: "Installed" (manage what's installed, via PluginManager) and
 * "Browse" (discover + install from the marketplace, via MarketplaceView).
 */

import { useState } from 'react'
import { MarketplaceView } from './MarketplaceView'
import { PluginManager } from './PluginManager'

type Tab = 'installed' | 'browse'

const TAB_BASE =
  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none'

export function PluginsPanel() {
  const [tab, setTab] = useState<Tab>('installed')
  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 rounded-lg border border-hairline bg-surface-1 p-1">
        {(['installed', 'browse'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`${TAB_BASE} ${
              tab === id ? 'bg-surface-0 text-ink-1 shadow-sm' : 'text-ink-3 hover:text-ink-1'
            }`}
          >
            {id === 'installed' ? 'Installed' : 'Browse'}
          </button>
        ))}
      </div>
      {tab === 'installed' ? <PluginManager /> : <MarketplaceView />}
    </div>
  )
}
