/**
 * Content & Safety settings (exploration 0175) — the per-viewer NSFW dial.
 *
 * A master adult-content switch (age-gated) plus a per-label dial
 * (show/warn/blur/hide), following Bluesky's model: a dial, not a binary, with
 * safe defaults. Preferences persist locally via useSensitivityPreferences.
 * Workbench-idiom styling via the settings kit (0179).
 */
import { sensitivityLabels, type SensitivityPreference } from '@xnetjs/abuse'
import { SettingRow, SettingsGroup, SettingsPanel, SettingToggle } from '@xnetjs/ui'
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
    <SettingsPanel
      className="max-w-2xl"
      title="Content & Safety"
      description="Choose how sensitive content appears in your feeds, messages, and matches. This is your dial — it never changes what others see."
    >
      {/* Adult content master switch */}
      <SettingsGroup>
        <SettingToggle
          label="Adult content"
          description="Off hides all sexual / nudity / explicit content regardless of the dials below."
          checked={adultEnabled}
          disabled={!preferences.ageConfirmed}
          onChange={setAdultContentEnabled}
        />
        {!preferences.ageConfirmed && (
          <button
            type="button"
            onClick={confirmAge}
            className="mt-2 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2"
          >
            I confirm I am 18 or older
          </button>
        )}
      </SettingsGroup>

      {/* Per-label dial */}
      <SettingsGroup label="Per-category filtering">
        {sensitivityLabels.map((label) => {
          const current = preferences.labels[label.id] ?? label.defaultVisibility
          return (
            <SettingRow key={label.id} label={label.name}>
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
                        ? 'bg-accent text-ink-1'
                        : 'text-ink-3 hover:bg-surface-2 hover:text-ink-1'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </SettingRow>
          )
        })}
      </SettingsGroup>

      {/* Dating default */}
      <SettingsGroup>
        <SettingToggle
          label="Blur unsolicited media"
          description="Blur images from people you have not matched with until you tap to reveal."
          checked={preferences.blurUnsolicitedMedia ?? true}
          onChange={setBlurUnsolicitedMedia}
        />
      </SettingsGroup>
    </SettingsPanel>
  )
}
