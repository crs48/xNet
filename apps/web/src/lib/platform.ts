/**
 * Platform / native-shell detection (exploration 0238).
 *
 * The mobile app ships the *same* `apps/web` SPA inside a native webview
 * (Capacitor). This module lets the web code answer "am I running inside a
 * native shell, and which one?" without taking a build-time dependency on
 * `@capacitor/core` — Capacitor injects a `window.Capacitor` global at runtime,
 * so detection is a dependency-free read of that bridge. On the plain web build
 * every check degrades to the web answer.
 */

export type ShellPlatform = 'ios' | 'android' | 'web'

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: Record<string, unknown>
}

/** The injected Capacitor bridge, if present. */
export function capacitorBridge(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** True when the Capacitor runtime is present (native shell *or* its web layer). */
export function isCapacitor(): boolean {
  return capacitorBridge() !== undefined
}

/**
 * True when running inside a native shell (iOS/Android webview), as opposed to a
 * browser tab or PWA. Drives whether to install native chrome (push, haptics,
 * deep links, biometric unlock).
 */
export function isNativeShell(): boolean {
  const cap = capacitorBridge()
  if (typeof cap?.isNativePlatform === 'function') {
    try {
      return cap.isNativePlatform()
    } catch {
      return false
    }
  }
  return false
}

/** Which platform the shell reports — `'web'` outside a native shell. */
export function nativePlatform(): ShellPlatform {
  const reported = capacitorBridge()?.getPlatform?.()
  return reported === 'ios' || reported === 'android' ? reported : 'web'
}

/**
 * True when launched as an installed PWA (standalone display), covering both the
 * standard `display-mode: standalone` and iOS Safari's legacy `navigator.standalone`.
 */
export function isStandalonePwa(): boolean {
  const mql = globalThis.matchMedia?.('(display-mode: standalone)')
  const iosStandalone = (globalThis.navigator as { standalone?: boolean } | undefined)?.standalone
  return Boolean(mql?.matches || iosStandalone)
}

/**
 * True when the context is cross-origin isolated — the gate for `SharedArrayBuffer`
 * and the fastest sqlite-wasm OPFS backend. In a webview this is what
 * `capacitor://localhost` + COOP/COEP unlocks (exploration 0238).
 */
export function isCrossOriginIsolated(): boolean {
  return (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
}
