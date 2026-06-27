/**
 * Native chrome layer (exploration 0238).
 *
 * The mobile app is the `apps/web` SPA hosted in a native webview. The only
 * mobile-specific code is this thin "chrome" that wires the webview to native
 * OS capabilities via Capacitor's injected `window.Capacitor.Plugins` bridge —
 * no build-time dependency on `@capacitor/*`. Everything degrades to a no-op on
 * the plain web build, so it is always safe to call at boot.
 *
 * What it installs when (and only when) running inside a native shell:
 *  - **Deep links**: `xnet://doc/<id>` (or an https universal link) → hash route.
 *  - **Background flush**: on app-background / `visibilitychange=hidden`, signal
 *    the data layer to flush in-flight changes to durable storage before the OS
 *    suspends the webview (don't trust the network in the background).
 *  - **Haptics**: a light tap when a change commits.
 */

import { isNativeShell } from '../lib/platform'

interface CapacitorPluginBridge {
  Plugins?: {
    App?: {
      addListener?: (
        event: string,
        cb: (data: unknown) => void
      ) => { remove?: () => void } | undefined
    }
    Haptics?: { impact?: (options: { style: string }) => unknown }
  }
}

function plugins(): NonNullable<CapacitorPluginBridge['Plugins']> | undefined {
  return (globalThis as { Capacitor?: CapacitorPluginBridge }).Capacitor?.Plugins
}

/**
 * Map a deep-link URL to the SPA's hash route and navigate there.
 *
 * `xnet://doc/<id>` parses to host `doc` + path `/<id>` → `#/doc/<id>`; an
 * https universal link uses its pathname directly. Returns the resolved route
 * (without the leading `#`) or `null` when the URL carries no route.
 */
export function routeDeepLink(url: string | undefined | null): string | null {
  if (!url) return null
  let route: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'xnet:') {
      // Custom scheme: the first segment is the URL "host".
      route = `/${parsed.host}${parsed.pathname}`.replace(/\/+$/, '')
    } else {
      route = parsed.pathname.replace(/\/+$/, '')
    }
  } catch {
    return null
  }
  if (!route || route === '/') return null
  globalThis.location.hash = `#${route}`
  return route
}

/** Ask the data layer to flush pending changes to durable storage. */
export function flushLocalData(): void {
  document.dispatchEvent(new Event('xnet:flush'))
}

let installed = false

/**
 * Install the native chrome listeners. No-op (returns a no-op disposer) unless
 * running inside a native shell. Idempotent.
 *
 * @returns a disposer that removes every listener it added.
 */
export function installNativeChrome(): () => void {
  if (installed || !isNativeShell()) return () => {}
  installed = true

  const cleanups: Array<() => void> = []
  const app = plugins()?.App
  const haptics = plugins()?.Haptics

  // Deep links + app-state (background) via the native App plugin.
  if (typeof app?.addListener === 'function') {
    const urlSub = app.addListener('appUrlOpen', (data) => {
      routeDeepLink((data as { url?: string } | undefined)?.url)
    })
    if (urlSub?.remove) cleanups.push(() => urlSub.remove?.())

    const stateSub = app.addListener('appStateChange', (data) => {
      if ((data as { isActive?: boolean } | undefined)?.isActive === false) flushLocalData()
    })
    if (stateSub?.remove) cleanups.push(() => stateSub.remove?.())
  }

  // Belt-and-suspenders background flush via the web-standard signal.
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flushLocalData()
  }
  document.addEventListener('visibilitychange', onVisibility)
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility))

  // Light haptic feedback on a committed change.
  const onCommit = (): void => {
    void haptics?.impact?.({ style: 'LIGHT' })
  }
  document.addEventListener('xnet:committed', onCommit)
  cleanups.push(() => document.removeEventListener('xnet:committed', onCommit))

  return () => {
    for (const dispose of cleanups) dispose()
    installed = false
  }
}

/** Test-only: reset the install guard so a fresh `installNativeChrome` runs. */
export function __resetNativeChrome(): void {
  installed = false
}
