#!/usr/bin/env node
/**
 * Register the native-messaging host with the browser (0289, Option C).
 *
 *   node scripts/install-host.mjs [--browser chrome|chromium|brave|edge]
 *
 * Writes `fyi.xnet.bridge.json` into the browser's NativeMessagingHosts
 * directory, filling in the absolute path to `xnet-bridge-host.mjs` and the
 * `allowed_origins` entry derived from the extension's own `key` — so the OS
 * enforces that ONLY our extension may launch the host. Re-run after `pnpm gen`
 * rotates the key, or for each browser you want to enable.
 *
 * This spike targets macOS/Linux (the manifest-file mechanism). Windows uses a
 * registry key instead; see README.md.
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { crxOriginFromKey } from './crx-id.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')
const hostPath = join(pkgRoot, 'host', 'xnet-bridge-host.mjs')
const template = JSON.parse(readFileSync(join(pkgRoot, 'host', 'manifest.template.json'), 'utf8'))
const extManifest = JSON.parse(readFileSync(join(pkgRoot, 'extension', 'manifest.json'), 'utf8'))

if (!extManifest.key) {
  console.error('extension/manifest.json has no `key`; run `node scripts/gen-extension-key.mjs` first.')
  process.exit(1)
}

const browser = argValue('--browser') ?? 'chrome'
const dir = hostDir(browser)
if (!dir) {
  console.error(`unsupported platform/browser: ${platform()} / ${browser}`)
  process.exit(1)
}

// The host file must be executable — the browser execs `path` directly.
chmodSync(hostPath, 0o755)

const manifest = {
  ...template,
  path: hostPath,
  allowed_origins: [crxOriginFromKey(extManifest.key)]
}
mkdirSync(dir, { recursive: true })
const out = join(dir, 'fyi.xnet.bridge.json')
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')

console.error(`installed native host manifest → ${out}`)
console.error(`  path            = ${manifest.path}`)
console.error(`  allowed_origins = ${manifest.allowed_origins[0]}`)
console.error('Load the unpacked extension from ./extension, then reload the xNet tab.')

/** NativeMessagingHosts directory per browser, macOS + Linux. */
function hostDir(browserName) {
  const home = homedir()
  const mac = {
    chrome: 'Google/Chrome',
    chromium: 'Chromium',
    brave: 'BraveSoftware/Brave-Browser',
    edge: 'Microsoft Edge'
  }
  const linux = {
    chrome: 'google-chrome',
    chromium: 'chromium',
    brave: 'BraveSoftware/Brave-Browser',
    edge: 'microsoft-edge'
  }
  if (platform() === 'darwin' && mac[browserName]) {
    return join(home, 'Library', 'Application Support', mac[browserName], 'NativeMessagingHosts')
  }
  if (platform() === 'linux' && linux[browserName]) {
    return join(home, '.config', linux[browserName], 'NativeMessagingHosts')
  }
  return null
}

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}
