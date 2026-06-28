/**
 * Recovery-phrase entry — recover an identity on this device by typing the phrase
 * (exploration 0243). Validates against the wordlist before enrolling, then the
 * provider derives the same DID and enrolls a local passkey to gate it.
 */
import { validateRecoveryPhrase } from '@xnetjs/identity'
import { useMemo, useState } from 'react'
import { useOnboarding } from '../OnboardingProvider'

export function RecoveryPhraseScreen(): JSX.Element {
  const { send, context } = useOnboarding()
  const [phrase, setPhrase] = useState('')

  const validation = useMemo(() => validateRecoveryPhrase(phrase), [phrase])
  const empty = phrase.trim().length === 0

  const hint = ((): string | null => {
    if (empty || validation.ok) return null
    if (validation.reason === 'too-short') {
      return `Enter your full phrase (at least 12 words) — ${validation.wordCount} so far.`
    }
    return `Not in the wordlist: ${validation.unknownWords.join(', ')}`
  })()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <h1 className="mb-2 text-2xl font-semibold">Enter your recovery phrase</h1>
      <p className="mb-6 max-w-md text-center text-muted-foreground">
        Type the recovery phrase you saved. It restores the same identity and your encrypted data on
        this device.
      </p>

      <textarea
        autoFocus
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder="amber anchor apple …"
        rows={3}
        className="mb-2 w-80 max-w-full resize-none rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm outline-none focus:border-primary"
      />

      <div className="mb-4 h-5 text-xs">
        {hint && <span className="text-destructive">{hint}</span>}
        {context.error && !hint && (
          <span className="text-destructive">{context.error.message}</span>
        )}
      </div>

      <button
        disabled={!validation.ok}
        className="mb-3 w-64 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => validation.ok && send({ type: 'SUBMIT_PHRASE', phrase })}
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
