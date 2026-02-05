/**
 * Unsupported browser screen — terminal state.
 * Directs user to download the desktop app.
 */
import { getPlatformAuthName } from '../helpers'

export function UnsupportedBrowserScreen(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
      <div className="text-5xl mb-4">:(</div>
      <h1 className="text-2xl font-semibold mb-2">Browser not supported</h1>

      <p className="text-muted-foreground text-center mb-6 max-w-md">
        xNet requires {getPlatformAuthName()} which isn't available in this browser.
      </p>

      <a
        href="/download"
        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors mb-6 no-underline"
      >
        Download Desktop App
      </a>

      <p className="text-xs text-muted-foreground">
        Supported browsers: Chrome 116+, Safari 18+, Edge 116+
      </p>
    </div>
  )
}
