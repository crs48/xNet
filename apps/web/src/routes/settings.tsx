/**
 * Settings page
 */
import { createFileRoute } from '@tanstack/react-router'
import { useIdentity } from '@xnet/react'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function SettingsPage() {
  const { identity } = useIdentity()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <section className="mb-6">
        <h2 className="text-lg font-medium mb-3">Identity</h2>
        <div className="bg-bg-secondary p-4 rounded-lg">
          <label className="text-xs text-text-secondary">Your DID</label>
          <p className="font-mono text-sm mt-1 break-all">{identity?.did || 'Not initialized'}</p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-medium mb-3">About</h2>
        <div className="bg-bg-secondary p-4 rounded-lg space-y-3">
          <div>
            <label className="text-xs text-text-secondary">Version</label>
            <p className="text-sm mt-1">1.0.0</p>
          </div>
          <div>
            <label className="text-xs text-text-secondary">Built with</label>
            <p className="text-sm mt-1">xNet SDK + TanStack Router</p>
          </div>
        </div>
      </section>
    </div>
  )
}
