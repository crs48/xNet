import { restoreDesktopSettings } from '../shared/desktop-settings'

async function boot(): Promise<void> {
  const recovery = await window.xnet.getSettingsRecovery()
  restoreDesktopSettings(localStorage, recovery)
  // Workbench and consent stores hydrate at module scope.
  await import('./main')
}

void boot().catch((error: unknown) => {
  const root = document.getElementById('root')
  if (!root) throw error
  const heading = document.createElement('h1')
  heading.textContent = 'Desktop settings could not be recovered'
  const detail = document.createElement('p')
  detail.textContent = error instanceof Error ? error.message : String(error)
  const help = document.createElement('p')
  help.textContent =
    'Your workspace has not been reset. Unlock the Mac key store if needed, then restart xNet.'
  root.replaceChildren(heading, detail, help)
})
