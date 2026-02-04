/**
 * Ready screen — identity created, hub connected (or offline).
 * Shows DID, hub status, and "Create your first page" CTA.
 */
import { useState } from 'react'
import { useOnboarding } from '../OnboardingProvider'
import { truncateDid, copyToClipboard } from '../helpers'

export function ReadyScreen(): JSX.Element {
  const { send, context } = useOnboarding()
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    if (context.identity?.did) {
      const ok = await copyToClipboard(context.identity.did)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }

  return (
    <div className="onboarding-screen ready">
      <h1>You're all set!</h1>

      {context.identity && (
        <div className="identity-info">
          <label>Your identity</label>
          <code className="did">{truncateDid(context.identity.did)}</code>
          <button className="copy-button" onClick={handleCopy} title="Copy full DID">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {context.hubUrl && (
        <div className="hub-info">
          <label>Connected to</label>
          <span>{context.hubUrl}</span>
        </div>
      )}

      {context.isDemo && (
        <div className="demo-banner">Demo mode — data expires after 24h of inactivity.</div>
      )}

      <button className="primary-button" onClick={() => send({ type: 'CREATE_FIRST_PAGE' })}>
        Create your first page
      </button>
    </div>
  )
}
