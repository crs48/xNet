/**
 * @vitest-environment jsdom
 */

import type { SelectedContext } from '../../../shared/workspace-session'
import { describe, expect, it } from 'vitest'
import { buildSelectedContextPrompt, isPreviewSelectedContextMessage } from './selected-context'

describe('selected-context helpers', () => {
  it('recognizes preview selected-context messages', () => {
    expect(
      isPreviewSelectedContextMessage({
        type: 'xnet:preview:selected-context',
        routeId: 'database-view'
      })
    ).toBe(true)

    expect(isPreviewSelectedContextMessage({ type: 'other' })).toBe(false)
  })

  it('builds a stable prompt prefill', () => {
    const context: SelectedContext = {
      sessionId: 'session-1',
      routeId: 'database-view',
      targetId: 'database-toolbar',
      targetLabel: 'Database toolbar',
      fileHint: 'apps/web/src/components/DatabaseView.tsx',
      documentId: 'db-1',
      bounds: null,
      nearbyText: 'Toolbar controls and view toggles',
      screenshotPath: '/tmp/session-1.png',
      capturedAt: 1
    }

    expect(buildSelectedContextPrompt(context, '/tmp/selected-context.json')).toContain(
      'Database toolbar'
    )
    expect(buildSelectedContextPrompt(context, '/tmp/selected-context.json')).toContain(
      '/tmp/selected-context.json'
    )
  })
})
