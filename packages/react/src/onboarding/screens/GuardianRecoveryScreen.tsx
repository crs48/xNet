/**
 * Guardian (social) recovery — recover an identity by collecting enough guardian share
 * codes (exploration 0243). It reads the required threshold from the shares themselves,
 * so the user just pastes codes until "enough" is reached. The provider reconstructs the
 * phrase, reproduces the same DID, and enrolls a local passkey. Entirely user-to-user;
 * the cloud is never involved.
 */
import { parseShare } from '@xnetjs/identity'
import { useMemo, useState } from 'react'
import { useOnboarding } from '../OnboardingProvider'

export function GuardianRecoveryScreen(): JSX.Element {
  const { send, context } = useOnboarding()
  const [text, setText] = useState('')

  const { validCodes, invalidCount, threshold } = useMemo(() => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const valid: string[] = []
    let invalid = 0
    let need: number | null = null
    for (const line of lines) {
      try {
        const share = parseShare(line)
        valid.push(line)
        need ??= share.threshold
      } catch {
        invalid += 1
      }
    }
    return { validCodes: valid, invalidCount: invalid, threshold: need }
  }, [text])

  const canRecover = threshold !== null && validCodes.length >= threshold

  const hint = ((): string => {
    if (context.error) return context.error.message
    if (text.trim().length === 0) return 'Paste one share code per line'
    if (invalidCount > 0)
      return `${invalidCount} code${invalidCount === 1 ? '' : 's'} not recognized`
    if (threshold !== null) return `${validCodes.length} of ${threshold} needed`
    return `${validCodes.length} share${validCodes.length === 1 ? '' : 's'} pasted`
  })()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <h1 className="mb-2 text-2xl font-semibold">Recover with your guardians</h1>
      <p className="mb-6 max-w-md text-center text-muted-foreground">
        Paste the share codes your guardians gave you — one per line. You need enough of them to
        restore your identity; we&rsquo;ll tell you when you have enough.
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
        <span
          className={
            context.error || invalidCount > 0 ? 'text-destructive' : 'text-muted-foreground'
          }
        >
          {hint}
        </span>
      </div>

      <button
        disabled={!canRecover}
        className="mb-3 w-64 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => canRecover && send({ type: 'SUBMIT_GUARDIAN_SHARES', codes: validCodes })}
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
