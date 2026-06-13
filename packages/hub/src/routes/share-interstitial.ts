/**
 * @xnetjs/hub - Share-link interstitial page (exploration 0169).
 *
 * `GET /s/:linkId` serves a static HTML page that attempts the `xnet://`
 * deep link into an installed app and falls back to the configured web app.
 * GET has no side effects, so link-preview scanners cannot consume a link.
 * The bearer secret lives in the URL fragment — this handler never sees it;
 * only inline page JS reads `location.hash` and forwards it client-side.
 */

import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { normalizeHttpUrl } from './share-links'

export type ShareInterstitialDeps = {
  /** Public hub URL; forwarded so the app knows where to claim. */
  publicUrl: string | undefined
  port: number
  /** Web app base. Trailing `#` marks a hash-routed deployment. */
  appUrl: string
  /** Apple team-prefixed app id (e.g. TEAMID.io.xnet.app) for Universal Links. */
  appleAppId?: string
  /** Android package + cert fingerprints for App Links. */
  androidPackage?: string
  androidCertSha256?: string[]
}

export const DEFAULT_APP_URL = 'https://xnet.fyi/app/#'

const LINK_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

const interstitialHtml = (input: {
  linkId: string
  hubHttpUrl: string
  appUrl: string
  nonce: string
}): string => {
  const config = JSON.stringify({
    linkId: input.linkId,
    hub: input.hubHttpUrl,
    appUrl: input.appUrl
  })
  return `<!doctype html>
<html lang="en" data-nosnippet>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<title>Opening shared document…</title>
<style nonce="${input.nonce}">
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; background: #0b0c0e; color: #e8e8ea; }
  main { max-width: 28rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
  p { font-size: 0.875rem; color: #9a9aa2; line-height: 1.5; }
  a { color: #7aa2ff; }
</style>
</head>
<body>
<main>
  <h1>Opening your shared document…</h1>
  <p id="status">We will open the desktop app if installed, then continue in the browser automatically.</p>
  <p><a id="continue" href="#">Continue in browser</a></p>
</main>
<script nonce="${input.nonce}" type="application/json" id="share-config">${config}</script>
<script nonce="${input.nonce}">
(function () {
  var config = JSON.parse(document.getElementById('share-config').textContent)
  var hashParams = new URLSearchParams(location.hash.replace(/^#/, ''))
  var secret = hashParams.get('s') || ''

  var query = 'share?link=' + encodeURIComponent(config.linkId) +
    '&hub=' + encodeURIComponent(config.hub)

  // Hash-routed app (base ends with '#'): the whole route lives in the
  // fragment, so the secret rides inside it and never reaches that server
  // either. Path-routed app: secret stays in a #s= fragment.
  var webTarget = config.appUrl.slice(-1) === '#'
    ? config.appUrl + '/' + query + (secret ? '&s=' + encodeURIComponent(secret) : '')
    : config.appUrl.replace(/\\/$/, '') + '/' + query + (secret ? '#s=' + encodeURIComponent(secret) : '')

  var deepLink = 'xnet://' + query + (secret ? '#s=' + encodeURIComponent(secret) : '')

  document.getElementById('continue').setAttribute('href', webTarget)

  var appOpened = false
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) appOpened = true
  })
  window.addEventListener('blur', function () { appOpened = true })

  location.href = deepLink
  setTimeout(function () {
    if (!appOpened) {
      document.getElementById('status').textContent = 'Continuing in the browser…'
      location.replace(webTarget)
    }
  }, 1500)
})()
</script>
</body>
</html>`
}

export const createShareInterstitialRoutes = (deps: ShareInterstitialDeps): Hono => {
  const app = new Hono()
  const hubHttpUrl = normalizeHttpUrl(deps.publicUrl ?? `http://localhost:${deps.port}`)

  app.get('/s/:linkId', (c) => {
    const linkId = c.req.param('linkId')
    if (!LINK_ID_RE.test(linkId)) {
      return c.text('Invalid share link', 400)
    }
    const nonce = randomBytes(16).toString('base64')
    c.header(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'`
    )
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    c.header('Cache-Control', 'no-store')
    return c.html(interstitialHtml({ linkId, hubHttpUrl, appUrl: deps.appUrl, nonce }))
  })

  // Universal Links / App Links manifests, served only when the native app
  // identifiers are configured. Self-hosted hubs without app entitlements
  // rely on the interstitial + custom scheme instead.
  if (deps.appleAppId) {
    const appleAppId = deps.appleAppId
    app.get('/.well-known/apple-app-site-association', (c) =>
      c.json({
        applinks: {
          apps: [],
          details: [{ appID: appleAppId, paths: ['/s/*'] }]
        }
      })
    )
  }

  if (deps.androidPackage && deps.androidCertSha256?.length) {
    const androidPackage = deps.androidPackage
    const fingerprints = deps.androidCertSha256
    app.get('/.well-known/assetlinks.json', (c) =>
      c.json([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: androidPackage,
            sha256_cert_fingerprints: fingerprints
          }
        }
      ])
    )
  }

  return app
}
