/**
 * /welcome (exploration 0176) — short, skippable first-run setup.
 *
 * Four steps: age confirmation, a "how should this feel" chooser (0352 — the
 * cozy/quiet feels are real choices offered in the lobby, not flags to find),
 * a one-screen content dial, and a discovery opt-in. Nothing here gates core
 * app use — every step can be skipped, and the same controls live in Settings
 * for later.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTheme } from '@xnetjs/ui'
import { useState } from 'react'
import {
  CONTENT_DIAL_PRESETS,
  applyContentDialPreset,
  type ContentDialPreset
} from '../lib/content-dial'
import {
  loadSensitivityPreferences,
  saveSensitivityPreferences
} from '../lib/sensitivity-preferences'
import { useWorkbench } from '../workbench/state'

/** The first-run feel presets (0352): venue calm by default, warmth on request. */
const FEEL_CHOICES = [
  {
    id: 'focused',
    name: 'Focused',
    description: 'Monochrome workbench — precise, dense, everything at hand.'
  },
  {
    id: 'cozy',
    name: 'Cozy',
    description: 'Warm paper and terracotta — a room, not an IDE.'
  },
  {
    id: 'quiet',
    name: 'Quiet',
    description: 'An almost-bare surface; chrome waits at the edges until summoned.'
  }
] as const

type FeelChoice = (typeof FEEL_CHOICES)[number]['id']

export const Route = createFileRoute('/welcome')({
  component: WelcomePage
})

function markOnboarded() {
  try {
    localStorage.setItem('xnet:onboarded', '1')
  } catch {
    // storage unavailable; onboarding will simply show again
  }
}

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem('xnet:onboarded') === '1'
  } catch {
    return false
  }
}

function WelcomePage() {
  const navigate = useNavigate()
  const { setVariant } = useTheme()
  const [step, setStep] = useState(0)
  const [ageConfirmed, setAgeConfirmed] = useState(false)

  const finish = (toDiscover: boolean) => {
    markOnboarded()
    void navigate({ to: toDiscover ? '/discover' : '/' })
  }

  const chooseFeel = (feel: FeelChoice) => {
    // Both axes persist (ThemeProvider storage / workbench store), so the
    // choice survives into the app and stays editable in Settings → Appearance.
    if (feel === 'cozy') setVariant('cozy')
    if (feel === 'quiet') useWorkbench.getState().setChrome('quiet')
    setStep(2)
  }

  const choosePreset = (preset: ContentDialPreset) => {
    const current = { ...loadSensitivityPreferences(), ageConfirmed }
    saveSensitivityPreferences(applyContentDialPreset(preset, current))
    setStep(3)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-8">
      {step === 0 && (
        <section className="space-y-4">
          <h1 className="cozy-heading text-xl font-semibold">Welcome to xNet</h1>
          <p className="text-sm text-muted-foreground">
            A couple of quick choices about what you see and who can find you. You can change
            everything later in Settings.
          </p>
          <p className="text-sm">Are you 18 or older?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAgeConfirmed(true)
                setStep(1)
              }}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
            >
              Yes, I'm 18+
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
            >
              Skip
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <h1 className="cozy-heading text-xl font-semibold">How should xNet feel?</h1>
          <p className="text-sm text-muted-foreground">
            The venue is calm by default; warmth is a choice, not a flag to find. Change it any
            time in Settings → Appearance.
          </p>
          <div className="space-y-2">
            {FEEL_CHOICES.map((feel) => (
              <button
                key={feel.id}
                type="button"
                onClick={() => chooseFeel(feel.id)}
                className="flex w-full flex-col rounded-md border border-border px-3 py-2 text-left hover:bg-accent/50"
              >
                <span className="text-sm font-medium">{feel.name}</span>
                <span className="text-xs text-muted-foreground">{feel.description}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
          >
            Skip
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h1 className="text-xl font-semibold">What content would you like to see?</h1>
          <div className="space-y-2">
            {CONTENT_DIAL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={preset.id === 'adult' && !ageConfirmed}
                onClick={() => choosePreset(preset.id)}
                className="flex w-full flex-col rounded-md border border-border px-3 py-2 text-left hover:bg-accent/50 disabled:opacity-50"
              >
                <span className="text-sm font-medium">{preset.name}</span>
                <span className="text-xs text-muted-foreground">{preset.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h1 className="text-xl font-semibold">Open to meeting people?</h1>
          <p className="text-sm text-muted-foreground">
            xNet can suggest people to connect with based on shared interests. You stay invisible
            until you opt in, and only waves you return open a chat.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => finish(true)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
            >
              Set up my profile
            </button>
            <button
              type="button"
              onClick={() => finish(false)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
            >
              Not now
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
