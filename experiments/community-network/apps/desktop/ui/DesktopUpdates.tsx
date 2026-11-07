import { invoke } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useEffect, useRef, useState } from 'react'
import { errorText } from './api'

/** Download a verified update while chatting. Restart only when the user asks. */
export function DesktopUpdates() {
  const update = useRef<Update | null>(null)
  const [version, setVersion] = useState('')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let closed = false
    let checking = false
    async function refresh() {
      if (closed || checking || update.current) return
      checking = true
      let candidate: Update | null = null
      try {
        if (!(await invoke<boolean>('updates_enabled')) || closed) return
        candidate = await check({ timeout: 30000 })
        if (!candidate || closed) return
        await candidate.download()
        if (closed) return
        update.current = candidate
        setVersion(candidate.version)
        candidate = null
      } catch (cause) {
        console.warn('Update check will retry', errorText(cause))
      } finally {
        await candidate?.close()
        checking = false
      }
    }
    void refresh()
    window.addEventListener('online', refresh)
    const timer = window.setInterval(refresh, 6 * 60 * 60 * 1000)
    return () => {
      closed = true
      window.clearInterval(timer)
      window.removeEventListener('online', refresh)
      void update.current?.close()
      update.current = null
    }
  }, [])

  if (!version) return null
  async function install() {
    if (!update.current || installing) return
    setInstalling(true)
    setError('')
    try {
      await update.current.install()
      await relaunch()
    } catch (cause) {
      setError(errorText(cause))
      setInstalling(false)
    }
  }
  return (
    <div>
      <button type="button" className="nav-item" disabled={installing} onClick={install}>
        {installing ? 'Installing update…' : `Restart to update to ${version}`}
      </button>
      {error && (
        <p className="small" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
