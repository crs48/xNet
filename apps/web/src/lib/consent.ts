/**
 * The app's single telemetry-consent spine (exploration 0210).
 *
 * One `ConsentManager`, persisted under `xnet:telemetry:consent` (default tier
 * `off`), gates EVERYTHING that could leave the device: the first-party crash
 * collector, the optional Sentry reporter, and any product analytics. The
 * settings panel and the first-run banner write into this same instance, so
 * there is one decision and every sink obeys it — not three parallel consent
 * systems.
 */
import { ConsentManager, LocalStorageConsentStorage } from '@xnetjs/telemetry'

export const consent = new ConsentManager({
  storage: new LocalStorageConsentStorage(),
  autoLoad: false
})

/**
 * One shared load of the persisted consent. `load()` does NOT emit a change
 * event, so consumers `await consentReady` once to pick up the restored tier —
 * calling `load()` per-mount instead would race with concurrent writes and could
 * revert a just-made choice.
 */
export const consentReady: Promise<void> = consent.load().catch(() => {
  /* no persisted consent yet — stays at the privacy-first default */
})

/**
 * True once the user has made an explicit telemetry choice. `DEFAULT_CONSENT`
 * stamps `grantedAt` at epoch 0; any real `setTier`/`reset` call stamps "now",
 * so a non-zero `grantedAt` means "the banner has been answered".
 */
export function hasChosenConsent(): boolean {
  return consent.current.grantedAt.getTime() !== 0
}
