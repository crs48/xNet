/**
 * @xnetjs/sqlite - Browser support detection for OPFS-based SQLite
 */

/**
 * Result of browser support check.
 */
export interface BrowserSupport {
  /** OPFS is available */
  opfs: boolean
  /** Web Workers are available */
  worker: boolean
  /** Browser is fully supported for SQLite-WASM with OPFS */
  supported: boolean
  /** Reason for lack of support (if not supported) */
  reason?: string
  /** Warning message for soft failures (app can still work with fallback) */
  warning?: string
}

/**
 * Timeout wrapper for promises that may hang indefinitely.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))
  ])
}

/**
 * Detect if the browser is Safari in Private Browsing Mode.
 * Safari disables storage APIs in private mode, causing OPFS to fail.
 */
function isSafariPrivateBrowsing(): boolean {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  if (!isSafari) return false

  try {
    localStorage.setItem('_test', '1')
    localStorage.removeItem('_test')
    return false
  } catch {
    return true
  }
}

/**
 * Check if the current browser supports SQLite-WASM with OPFS.
 *
 * Requirements:
 * - Web Workers (for running SQLite off the main thread)
 * - Origin Private File System (OPFS) for persistent storage
 *
 * Supported browsers:
 * - Chrome 102+ (March 2022)
 * - Edge 102+ (March 2022)
 * - Firefox 111+ (March 2023)
 * - Safari 16.4+ (March 2023)
 *
 * Note: If OPFS test fails but APIs exist, we allow the app to proceed
 * with a warning. The worker will fall back to in-memory mode if needed.
 *
 * @example
 * ```typescript
 * const support = await checkBrowserSupport()
 * if (!support.supported) {
 *   showUnsupportedBrowserMessage(support.reason!)
 *   return
 * }
 * if (support.warning) {
 *   showWarningBanner(support.warning)
 * }
 * // Proceed with SQLite initialization
 * ```
 */
export async function checkBrowserSupport(): Promise<BrowserSupport> {
  const result: BrowserSupport = {
    opfs: false,
    worker: true,
    supported: false
  }

  // Check Web Worker support (hard requirement)
  if (typeof Worker === 'undefined') {
    result.worker = false
    result.reason = 'Web Workers not supported in this browser.'
    return result
  }

  // Check OPFS API existence (hard requirement)
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    result.reason =
      'Origin Private File System (OPFS) not supported. Please use a modern browser (Chrome 102+, Firefox 111+, Safari 16.4+).'
    return result
  }

  // Test OPFS access with timeout (soft failure - warn but don't block)
  // Keep this probe minimal for Safari compatibility: checking directory
  // access is enough to validate OPFS availability, while create/delete
  // probes can fail in some Safari contexts despite OPFS being usable.
  try {
    const testOPFS = async () => {
      await navigator.storage.getDirectory()
    }

    await withTimeout(testOPFS(), 5000, 'OPFS access timeout')
    result.opfs = true
    result.supported = true
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const normalized = errorMessage.toLowerCase()
    const safariStorageContextError =
      normalized.includes('object can not be found here') ||
      normalized.includes('object cannot be found here') ||
      normalized.includes('operation is insecure')

    // Check for Safari private browsing
    if (isSafariPrivateBrowsing()) {
      result.warning =
        'Safari Private Browsing detected. Storage may be limited. For full functionality, switch to normal mode or use the xNet Desktop App.'
      result.supported = true
    } else if (
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
      safariStorageContextError
    ) {
      result.warning =
        'Safari storage APIs are restricted in this context. xNet will continue, but persistence may be limited between sessions.'
      result.supported = true
    } else {
      // Allow app to proceed with warning - worker will handle fallback
      result.warning = `Storage access limited (${errorMessage}). Data persistence may be limited between sessions. For full functionality, use the xNet Desktop App.`
      result.supported = true
    }
  }

  return result
}

/**
 * Show an unsupported browser message to the user.
 *
 * This replaces the app content with a helpful message explaining
 * that the browser is not supported and suggesting alternatives.
 *
 * @param reason - The reason for lack of support
 *
 * @example
 * ```typescript
 * const support = await checkBrowserSupport()
 * if (!support.supported) {
 *   showUnsupportedBrowserMessage(support.reason!)
 * }
 * ```
 */
export function showUnsupportedBrowserMessage(reason: string): void {
  const container = document.getElementById('app') ?? document.body

  container.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
      text-align: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fafafa;
      color: #333;
    ">
      <div style="
        background: white;
        padding: 2rem 2.5rem;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        max-width: 480px;
        width: 100%;
      ">
        <h1 style="
          font-size: 1.5rem;
          margin: 0 0 1rem 0;
          color: #111;
          font-weight: 600;
        ">
          Browser Not Supported
        </h1>
        <p style="
          color: #555;
          margin: 0 0 1.5rem 0;
          line-height: 1.6;
          font-size: 1rem;
        ">
          ${escapeHtml(reason)}
        </p>
        <div style="
          background: #f5f5f5;
          padding: 1rem;
          border-radius: 8px;
          text-align: left;
          font-size: 0.9rem;
        ">
          <p style="margin: 0 0 0.5rem 0; font-weight: 500;">Supported browsers:</p>
          <ul style="margin: 0; padding-left: 1.5rem; color: #666;">
            <li>Chrome 102+ (March 2022)</li>
            <li>Edge 102+ (March 2022)</li>
            <li>Firefox 111+ (March 2023)</li>
            <li>Safari 16.4+ (March 2023)</li>
          </ul>
        </div>
        <p style="
          color: #888;
          font-size: 0.875rem;
          margin: 1.5rem 0 0 0;
        ">
          For the best experience, please use the 
          <a href="https://xnet.app/download" style="
            color: #0066cc;
            text-decoration: none;
            font-weight: 500;
          ">
            xNet Desktop App
          </a>
          or update your browser.
        </p>
      </div>
    </div>
  `
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
