/**
 * Unsupported browser screen — terminal state.
 * Directs user to download the desktop app.
 */
import { getPlatformAuthName } from '../helpers'

export function UnsupportedBrowserScreen(): JSX.Element {
  return (
    <div className="onboarding-screen unsupported">
      <h1>Browser not supported</h1>

      <p>xNet requires {getPlatformAuthName()} which isn't available in this browser.</p>

      <a href="/download" className="primary-button">
        Download Desktop App
      </a>

      <p className="supported-browsers">Supported browsers: Chrome 116+, Safari 18+, Edge 116+</p>
    </div>
  )
}
