/**
 * @xnetjs/hub - Security hardening regression checks.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(currentDir, '../../..')

const readSource = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8')

describe('Security hardening regressions', () => {
  it('keeps bearer tokens out of URL construction paths', () => {
    // Hub-session/URL handling moved from App.tsx to the boot orchestrator
    // (exploration 0276) — check both the shell and the boot unit.
    const webApp = readSource('apps/web/src/App.tsx')
    const webBoot = readSource('apps/web/src/boot/use-boot-sequence.ts')
    const webShareRoute = readSource('apps/web/src/routes/share.tsx')
    const dataService = readSource('apps/electron/src/data-process/data-service.ts')

    expect(webApp).not.toMatch(/[?&]token=/)
    expect(webBoot).not.toMatch(/[?&]token=/)
    expect(webShareRoute).not.toMatch(/[?&]token=/)
    expect(dataService).not.toMatch(/searchParams\.set\(\s*['"]token['"]/)
  })

  it('strips secret-bearing params from browser URLs', () => {
    const webBoot = readSource('apps/web/src/boot/use-boot-sequence.ts')
    const webShareRoute = readSource('apps/web/src/routes/share.tsx')

    // stripParams removes the named params from both the search string and
    // the hash query (hash routing) before rewriting history.
    expect(webBoot).toContain("stripParams('payload', 'handle')")
    expect(webBoot).toContain("stripParams('shareSession')")
    expect(webBoot).toContain('window.history.replaceState')

    expect(webShareRoute).toContain('window.history.replaceState')
  })

  it('uses redacted support diagnostics instead of copying raw secrets', () => {
    const webShareRoute = readSource('apps/web/src/routes/share.tsx')

    expect(webShareRoute).toContain('Copy support code')
    expect(webShareRoute).not.toContain('Copy raw share value')
    expect(webShareRoute).toContain('maskSecretValue')
  })

  it('preserves low-friction secure share UX entry points', () => {
    const shareButton = readSource('apps/electron/src/renderer/components/ShareButton.tsx')
    const addSharedDialog = readSource('apps/electron/src/renderer/components/AddSharedDialog.tsx')

    expect(shareButton).toContain('One-time handoff')
    expect(addSharedDialog).toContain('Add to Library')
  })
})
