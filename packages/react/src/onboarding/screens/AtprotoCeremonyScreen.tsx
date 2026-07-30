/**
 * ATProto login-door screen (0322/0338): the user types a handle or PDS, we
 * run the OAuth ceremony, and then the *existing* passkey-create flow runs
 * unchanged. Explicit copy makes clear the Bluesky account does not hold or
 * recover xNet keys unless the user later enables the Phase-2 recovery anchor.
 */
import { useState } from 'react'
import { useOnboarding } from '../OnboardingProvider'

export function AtprotoCeremonyScreen(): JSX.Element {
  const { context, send, startAtprotoCeremony } = useOnboarding()
  const [handle, setHandle] = useState('')
  const linked = Boolean(context.atprotoDid)

  const submit = (): void => {
    const value = handle.trim()
    if (value) startAtprotoCeremony(value)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
      <h1 className="text-2xl font-semibold mb-2">Continue with Bluesky</h1>
      <p className="text-muted-foreground text-center mb-6 max-w-sm">
        Sign in with your ATProto handle to claim a free global name. Works with Bluesky or any PDS.
      </p>

      {linked ? (
        <p className="text-sm text-muted-foreground mb-6">
          Linked <span className="font-medium text-foreground">@{context.atprotoHandle}</span> —
          finishing your passkey…
        </p>
      ) : (
        <div className="w-full max-w-sm">
          <label htmlFor="atproto-handle" className="sr-only">
            ATProto handle
          </label>
          <input
            id="atproto-handle"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="alice.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background mb-3"
          />
          <button
            onClick={submit}
            disabled={!handle.trim()}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {context.error && (
        <p className="text-sm text-destructive mt-4 max-w-sm text-center">
          {context.error.message}
        </p>
      )}

      <p className="text-xs text-muted-foreground/80 text-center max-w-xs mt-6">
        Your Bluesky account gives you a global name. It does <strong>not</strong> hold or recover
        your xNet keys unless you later enable it as a recovery anchor.
      </p>

      <button
        className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline mt-6"
        onClick={() => send({ type: 'BACK_TO_WELCOME' })}
      >
        Back
      </button>
    </div>
  )
}
