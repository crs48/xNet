/**
 * Content & Safety settings (exploration 0175) — the per-viewer NSFW dial.
 *
 * A master adult-content switch (age-gated) plus a per-label dial
 * (show/warn/blur/hide), following Bluesky's model: a dial, not a binary, with
 * safe defaults. Preferences persist locally via useSensitivityPreferences.
 */
import { sensitivityLabels, type SensitivityPreference } from '@xnetjs/abuse'
import { useSensitivityPreferences } from '../lib/sensitivity-preferences'

const PREF_OPTIONS: { value: SensitivityPreference; label: string }[] = [
  { value: 'show', label: 'Show' },
  { value: 'warn', label: 'Warn' },
  { value: 'blur', label: 'Blur' },
  { value: 'hide', label: 'Hide' }
]

export function ContentSafetySettings() {
  const {
    preferences,
    setLabelPreference,
    setAdultContentEnabled,
    confirmAge,
    setBlurUnsolicitedMedia
  } = useSensitivityPreferences()

  const adultEnabled = preferences.adultContentEnabled && preferences.ageConfirmed

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h2 className="text-lg font-semibold">Content &amp; Safety</h2>
        <p className="text-sm text-muted-foreground">
          Choose how sensitive content appears in your feeds, messages, and matches. This is your
          dial — it never changes what others see.
        </p>
      </header>

      {/* Adult content master switch */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium">Adult content</h3>
            <p className="text-xs text-muted-foreground">
              Off hides all sexual / nudity / explicit content regardless of the dials below.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={adultEnabled}
              disabled={!preferences.ageConfirmed}
              onChange={(event) => setAdultContentEnabled(event.target.checked)}
            />
            <span>{adultEnabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
        {!preferences.ageConfirmed && (
          <button
            type="button"
            onClick={confirmAge}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
          >
            I confirm I am 18 or older
          </button>
        )}
      </section>

      {/* Per-label dial */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Per-category filtering</h3>
        <div className="space-y-2">
          {sensitivityLabels.map((label) => {
            const current = preferences.labels[label.id] ?? label.defaultVisibility
            return (
              <div
                key={label.id}
                className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm">{label.name}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={label.name}>
                  {PREF_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={current === option.value}
                      onClick={() => setLabelPreference(label.id, option.value)}
                      className={`rounded px-2 py-1 text-xs transition-colors ${
                        current === option.value
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Dating default */}
      <section className="space-y-2">
        <label className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium">Blur unsolicited media</h3>
            <p className="text-xs text-muted-foreground">
              Blur images from people you have not matched with until you tap to reveal.
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.blurUnsolicitedMedia ?? true}
            onChange={(event) => setBlurUnsolicitedMedia(event.target.checked)}
          />
        </label>
      </section>
    </div>
  )
}
