import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncElectronVersion } from './sync-electron-version.mjs'

// Builds a minimal repo fixture: core at `coreVersion`, electron at
// `electronVersion`, and optionally a pre-existing desktop changelog.
function fixture({ coreVersion, electronVersion, changelog }) {
  const root = mkdtempSync(join(tmpdir(), 'sync-electron-'))
  mkdirSync(join(root, 'packages/core'), { recursive: true })
  mkdirSync(join(root, 'apps/electron'), { recursive: true })
  writeFileSync(
    join(root, 'packages/core/package.json'),
    JSON.stringify({ name: '@xnetjs/core', version: coreVersion }, null, 2) + '\n',
  )
  writeFileSync(
    join(root, 'apps/electron/package.json'),
    JSON.stringify(
      { name: 'xnet-desktop', version: electronVersion, private: true },
      null,
      2,
    ) + '\n',
  )
  if (changelog !== undefined) {
    writeFileSync(join(root, 'apps/electron/CHANGELOG.md'), changelog)
  }
  return root
}

const silent = () => {}

test('bumps package.json and creates CHANGELOG.md with a matching entry', () => {
  const root = fixture({ coreVersion: '0.1.0', electronVersion: '0.0.3' })
  const result = syncElectronVersion(root, silent)

  assert.equal(result.changed, true)
  const pkg = JSON.parse(readFileSync(join(root, 'apps/electron/package.json'), 'utf8'))
  assert.equal(pkg.version, '0.1.0')

  // changesets/action reads this file for every version-changed package —
  // it must exist and carry an entry for the new version (exploration 0265).
  const changelog = readFileSync(join(root, 'apps/electron/CHANGELOG.md'), 'utf8')
  assert.match(changelog, /^# xnet-desktop/)
  assert.match(changelog, /## 0\.1\.0\n/)
  assert.match(changelog, /@xnetjs\/core 0\.1\.0 train/)
})

test('prepends the new entry above older ones', () => {
  const root = fixture({
    coreVersion: '0.2.0',
    electronVersion: '0.1.0',
    changelog: '# xnet-desktop\n\n## 0.1.0\n\nOlder entry.\n',
  })
  syncElectronVersion(root, silent)

  const changelog = readFileSync(join(root, 'apps/electron/CHANGELOG.md'), 'utf8')
  const idxNew = changelog.indexOf('## 0.2.0')
  const idxOld = changelog.indexOf('## 0.1.0')
  assert.ok(idxNew !== -1 && idxOld !== -1)
  assert.ok(idxNew < idxOld, 'new entry must come first')
  assert.match(changelog, /Older entry\./)
})

test('no-op when versions already match — does not create a changelog', () => {
  const root = fixture({ coreVersion: '0.1.0', electronVersion: '0.1.0' })
  const result = syncElectronVersion(root, silent)

  assert.equal(result.changed, false)
  assert.equal(existsSync(join(root, 'apps/electron/CHANGELOG.md')), false)
})

test('idempotent per version — running twice keeps a single entry', () => {
  const root = fixture({ coreVersion: '0.1.0', electronVersion: '0.0.3' })
  syncElectronVersion(root, silent)
  // Simulate a re-run where the changelog entry exists but the version was
  // somehow reverted (e.g. a partially applied release PR).
  writeFileSync(
    join(root, 'apps/electron/package.json'),
    JSON.stringify({ name: 'xnet-desktop', version: '0.0.3', private: true }, null, 2) +
      '\n',
  )
  syncElectronVersion(root, silent)

  const changelog = readFileSync(join(root, 'apps/electron/CHANGELOG.md'), 'utf8')
  assert.equal(changelog.match(/## 0\.1\.0/g).length, 1)
})

test('preserves package.json formatting — only the version line changes', () => {
  const root = fixture({ coreVersion: '0.1.0', electronVersion: '0.0.3' })
  const before = readFileSync(join(root, 'apps/electron/package.json'), 'utf8')
  syncElectronVersion(root, silent)
  const after = readFileSync(join(root, 'apps/electron/package.json'), 'utf8')
  assert.equal(after, before.replace('"version": "0.0.3"', '"version": "0.1.0"'))
})
