/**
 * Shows a freshly minted recovery phrase once (exploration 0243). The user must
 * confirm they saved it before continuing — it's the only way their data survives a
 * lost passkey, and we never store it in the clear.
 */
import { useState } from 'react'
import { useOnboarding } from '../OnboardingProvider'

export function ShowRecoveryPhraseScreen(): JSX.Element {
  const { send, context } = useOnboarding()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const phrase = context.recoveryPhrase ?? ''
  const words = phrase.split(' ').filter(Boolean)

  const copy = (): void => {
    void navigator.clipboard?.writeText(phrase).then(
      () => setCopied(true),
      () => setCopied(false)
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <h1 className="mb-2 text-2xl font-semibold">Save your recovery phrase</h1>
      <p className="mb-6 max-w-md text-center text-muted-foreground">
        Write these words down and keep them somewhere safe. They are the only way to recover your
        workspace if you lose your passkey — we can&rsquo;t recover them for you.
      </p>

      <ol className="mb-3 grid w-80 max-w-full grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/30 p-4 font-mono text-sm">
        {words.map((word, i) => (
          <li key={`${i}-${word}`} className="flex gap-2">
            <span className="w-5 select-none text-right text-muted-foreground">{i + 1}</span>
            <span>{word}</span>
          </li>
        ))}
      </ol>

      <button
        className="mb-5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={copy}
      >
        {copied ? 'Copied ✓' : 'Copy to clipboard'}
      </button>

      <label className="mb-4 flex max-w-xs cursor-pointer items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5"
        />
        I&rsquo;ve saved my recovery phrase somewhere safe.
      </label>

      <button
        disabled={!saved}
        className="w-64 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => send({ type: 'PHRASE_SAVED' })}
      >
        Continue
      </button>
    </div>
  )
}
