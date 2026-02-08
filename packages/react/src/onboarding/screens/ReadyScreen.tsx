/**
 * Ready screen — identity created, hub connected (or offline).
 * Shows DID, hub status, and "Create your first page" CTA.
 */
import { useState, useEffect, useRef } from 'react'
import { truncateDid, copyToClipboard } from '../helpers'
import { useOnboarding } from '../OnboardingProvider'

export function ReadyScreen(): JSX.Element {
  const { send, context } = useOnboarding()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async (): Promise<void> => {
    if (context.identity?.did) {
      const ok = await copyToClipboard(context.identity.did)
      if (ok) {
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 2000)
      }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
      <div className="text-5xl mb-4">&#10003;</div>
      <h1 className="text-2xl font-semibold mb-6">You're all set!</h1>

      {context.identity && (
        <div className="flex flex-col items-center mb-4">
          <label className="text-xs text-muted-foreground mb-1">Your identity</label>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono bg-muted px-3 py-1 rounded">
              {truncateDid(context.identity.did)}
            </code>
            <button
              className="text-xs text-primary hover:text-primary/80 transition-colors"
              onClick={handleCopy}
              title="Copy full DID"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {context.hubUrl && (
        <div className="flex flex-col items-center mb-4">
          <label className="text-xs text-muted-foreground mb-1">Connected to</label>
          <span className="text-sm font-mono">{context.hubUrl}</span>
        </div>
      )}

      {context.isDemo && (
        <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 rounded-lg text-sm mb-6">
          Demo mode — data is saved locally; encrypted backups expire after 24h of inactivity.
        </div>
      )}

      <button
        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        onClick={() => send({ type: 'CREATE_FIRST_PAGE' })}
      >
        Create your first page
      </button>
    </div>
  )
}
