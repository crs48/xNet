import React from 'react'
import ReactDOM from 'react-dom/client'
import { DemosApp } from './App'
// devtools.css first so the demos' own stylesheet wins the cascade where
// they overlap (e.g. the body background comes from --bg, not the tokens).
import './devtools.css'
import './styles.css'

// Follow the site's theme choice (the landing toggle persists
// 'xnet-lp-theme' on this shared origin), falling back to the OS. The
// inline script in index.html applies it before first paint; these
// listeners keep it live — `storage` fires inside the /demos iframes the
// moment the surrounding site's toggle writes the key.
const THEME_KEY = 'xnet-lp-theme'
const lightMedia = window.matchMedia('(prefers-color-scheme: light)')
const applyTheme = () => {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(THEME_KEY)
  } catch {
    /* private mode */
  }
  const theme = stored || (lightMedia.matches ? 'light' : 'dark')
  document.documentElement.classList.toggle('dark', theme === 'dark')
}
applyTheme()
lightMedia.addEventListener('change', applyTheme)
window.addEventListener('storage', (e) => {
  if (e.key === THEME_KEY) applyTheme()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemosApp />
  </React.StrictMode>
)
