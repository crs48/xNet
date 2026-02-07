/**
 * @xnet/sqlite - Browser support detection for OPFS-based SQLite
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
 * @example
 * ```typescript
 * const support = await checkBrowserSupport()
 * if (!support.supported) {
 *   showUnsupportedBrowserMessage(support.reason!)
 *   return
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

  // Check Web Worker support
  if (typeof Worker === 'undefined') {
    result.worker = false
    result.reason = 'Web Workers not supported in this browser.'
    return result
  }

  // Check OPFS support
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    result.reason =
      'Origin Private File System (OPFS) not supported. Please use a modern browser (Chrome 102+, Firefox 111+, Safari 16.4+).'
    return result
  }

  // Test OPFS access
  try {
    const root = await navigator.storage.getDirectory()
    // Try to create and delete a test file
    const testFileName = '.xnet-support-test-' + Date.now()
    await root.getFileHandle(testFileName, { create: true })
    await root.removeEntry(testFileName)
    result.opfs = true
  } catch (err) {
    result.reason = `OPFS access failed: ${(err as Error).message}`
    return result
  }

  result.supported = true
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
