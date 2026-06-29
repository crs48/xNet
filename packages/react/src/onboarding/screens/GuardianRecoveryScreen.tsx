/**
 * Guardian (social) recovery — recover an identity by collecting enough guardian share
 * codes (exploration 0243). The provider reconstructs the phrase from the shares,
 * reproduces the same DID, and enrolls a local passkey. Entirely user-to-user; the
 * cloud is never involved.
 */
import { useMemo, useState } from 'react'
import { useOnboarding } from '../OnboardingProvider'

export function GuardianRecoveryScreen(): JSX.Element {
  const { send, context } = useOnboarding()
  const [text, setText] = useState('')

  const codes = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [text]
  )

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <h1 className="mb-2 text-2xl font-semibold">Recover with your guardians</h1>
      <p className="mb-6 max-w-md text-center text-muted-foreground">
        Paste the share codes your guardians gave you — one per line. You need enough of them (the
        threshold you chose when you set this up) to restore your identity.
      </p>

      <textarea
        autoFocus
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'xnet-share:…\nxnet-share:…'}
        rows={5}
        className="mb-2 w-80 max-w-full resize-none rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs outline-none focus:border-primary"
      />

      <div className="mb-4 h-5 text-xs">
        {context.error ? (
          <span className="text-destructive">{context.error.message}</span>
        ) : (
          <span className="text-muted-foreground">
            {codes.length} share{codes.length === 1 ? '' : 's'} pasted
          </span>
        )}
      </div>

      <button
        disabled={codes.length < 2}
        className="mb-3 w-64 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => codes.length >= 2 && send({ type: 'SUBMIT_GUARDIAN_SHARES', codes })}
      >
        Recover my identity
      </button>

      <button
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => send({ type: 'BACK_TO_WELCOME' })}
      >
        Back
      </button>
    </div>
  )
}
