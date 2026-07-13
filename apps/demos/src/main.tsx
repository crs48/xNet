import React from 'react'
import ReactDOM from 'react-dom/client'
import { DemosApp } from './App'
import './styles.css'
import './devtools.css'

// The devtools' design tokens switch on an `html.dark` class; the demos
// themselves use prefers-color-scheme. Keep the two in sync with the OS.
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)')
const syncTheme = () => document.documentElement.classList.toggle('dark', darkMedia.matches)
syncTheme()
darkMedia.addEventListener('change', syncTheme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemosApp />
  </React.StrictMode>
)
