import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const required = [
  'Cargo.toml',
  'Cargo.lock',
  'apps/desktop/src-tauri/tauri.conf.json',
  'crates/network/src/lib.rs',
  'deploy/hub/stage.sh',
  'extension/manifest.json',
  'LEGACY.md',
  'CONTRIBUTING.md',
  '.github/workflows/ci.yml'
]
const retired = [
  'packages/data/package.json',
  'apps/electron/package.json',
  'apps/web/package.json',
  'apps/expo/package.json',
  'pnpm-workspace.yaml',
  '.github/workflows/electron-release.yml',
  '.github/workflows/npm-release.yml'
]

// Consumer: local lint and CI quality. Any missing entry point, retired build
// surface, or silent profile/trust-root change makes this gate fail.
export function violations({ present, manifest, desktop, beta, stage }) {
  const errors = required.filter((path) => !present.has(path)).map((path) => `Missing ${path}`)
  errors.push(
    ...retired.filter((path) => present.has(path)).map((path) => `Retired surface: ${path}`)
  )
  if (manifest.name !== 'xnet' || manifest.scripts.dev !== 'pnpm desktop:dev')
    errors.push('Default product must be the native xNet app')
  if (desktop.identifier !== 'fyi.xnet.community.experiment')
    errors.push('Existing desktop profile identity changed')
  if (desktop.plugins?.['deep-link']?.desktop?.schemes?.[0] !== 'xnet-community')
    errors.push('Existing invitations need their URI scheme')
  if (beta.plugins?.updater?.requireSignedVersion !== true)
    errors.push('Updater must bind signatures to versions')
  if (
    beta.plugins?.updater?.pubkey !==
    'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDExRkE4OEZCMEUyQUVGQkEKUldTNjd5b08rNGo2RVNUVldzVlI1ZEI1Ukw3dHJqb3RNRlFuZXppbHBlWko4akJ4UXJyYlJwQXEK'
  )
    errors.push('Existing updater trust root changed')
  if (
    stage.includes('experiments/community-network') ||
    /cp\s+-R\s+["']?\$root["']?\s/u.test(stage)
  )
    errors.push('Hub staging must use explicit source paths in the new tree')
  return errors
}
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const snapshot = {
  present: new Set([...required, ...retired].filter((path) => existsSync(resolve(root, path)))),
  manifest: readJson('package.json'),
  desktop: readJson('apps/desktop/src-tauri/tauri.conf.json'),
  beta: readJson('apps/desktop/src-tauri/beta.conf.json'),
  stage: readFileSync(resolve(root, 'deploy/hub/stage.sh'), 'utf8')
}
if (process.argv.includes('--selftest')) {
  const valid = { ...snapshot, present: new Set(required) }
  assert.deepEqual(violations(valid), [])
  for (const path of required) {
    const present = new Set(required)
    present.delete(path)
    assert.ok(violations({ ...valid, present }).length > 0, `Missing ${path} was not rejected`)
  }
  for (const path of retired)
    assert.ok(violations({ ...valid, present: new Set([...required, path]) }).length > 0)
  assert.ok(
    violations({ ...valid, desktop: { ...valid.desktop, identifier: 'changed' } }).length > 0
  )
  assert.ok(
    violations({ ...valid, beta: { plugins: { updater: { requireSignedVersion: false } } } })
      .length > 0
  )
  assert.ok(violations({ ...valid, stage: 'experiments/community-network' }).length > 0)
  console.log('Repository negative controls passed (in memory).')
} else {
  const errors = violations(snapshot)
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    'Primary product entry points, profile identity, update trust, and hub staging verified.'
  )
}
