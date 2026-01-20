/**
 * Settings page
 */
import { createFileRoute } from '@tanstack/react-router'
import { useIdentity, useSync } from '@xnet/react'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function SettingsPage() {
  const { identity } = useIdentity()
  const { status, peerCount } = useSync()

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Identity</h2>
        <div style={{ background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Your DID</label>
          <p style={{ fontFamily: 'monospace', fontSize: 14, marginTop: 4, wordBreak: 'break-all' }}>
            {identity?.did || 'Not initialized'}
          </p>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Sync</h2>
        <div style={{ background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 8 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Status</label>
            <p style={{ fontSize: 14, marginTop: 4 }}>{status}</p>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Connected Peers</label>
            <p style={{ fontSize: 14, marginTop: 4 }}>{peerCount}</p>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>About</h2>
        <div style={{ background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 8 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Version</label>
            <p style={{ fontSize: 14, marginTop: 4 }}>1.0.0</p>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Built with</label>
            <p style={{ fontSize: 14, marginTop: 4 }}>xNet SDK + TanStack Router</p>
          </div>
        </div>
      </section>
    </div>
  )
}
