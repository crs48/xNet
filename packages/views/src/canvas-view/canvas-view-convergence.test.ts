/**
 * CanvasView convergence guards (exploration 0277 validation).
 *
 * Source-level assertions in the spirit of 0276's drift guards: both app
 * CanvasViews must render nodes through the shared dispatcher and cards,
 * and neither may grow back a local fork of the converged pieces. If one
 * of these fails, a platform has started diverging again — fix the drift,
 * don't delete the guard.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvasFrameVariantProperties } from '@xnetjs/canvas'
import { describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..', '..', '..', '..')
const webCanvasView = readFileSync(join(repoRoot, 'apps/web/src/components/CanvasView.tsx'), 'utf8')
const desktopCanvasView = readFileSync(
  join(repoRoot, 'apps/electron/src/renderer/components/CanvasView.tsx'),
  'utf8'
)

describe('CanvasView convergence (0277)', () => {
  const sides = [
    ['web', webCanvasView],
    ['desktop', desktopCanvasView]
  ] as const

  it.each(sides)('%s renders node cards through the shared dispatcher', (_side, source) => {
    expect(source).toContain('renderCanvasNodeCard')
    expect(source).toContain('shouldRenderCanvasNodeCard')
    expect(source).toContain('CanvasWidgetNodeCard')
  })

  it.each(sides)('%s consumes the shared controller and capabilities', (_side, source) => {
    expect(source).toContain('useCanvasViewController')
    expect(source).toContain('useCanvasUndoLadder')
    expect(source).toContain('useCanvasQueryFrames')
    expect(source).toContain('useCanvasSourceReferences')
    expect(source).toContain('CanvasSelectionHud')
    expect(source).toContain('useCanvasPeek')
    expect(source).toContain('useCanvasCommands')
  })

  it.each(sides)('%s has no resurrected local card fork', (_side, source) => {
    expect(source).not.toContain('function CanvasMediaCard')
    expect(source).not.toContain('function CanvasPageStaticPreviewCard')
    expect(source).not.toContain('function renderNodeCard')
    expect(source).not.toContain('DashboardRuntimeProvider')
  })

  it.each(sides)('%s creates frames only through the shared controller', (_side, source) => {
    // The factory call lives in the controller; a hand-rolled property bag
    // on either side reintroduces the 0277 M2 wire-format drift.
    expect(source).not.toContain("containerRole: 'frame'")
  })

  it('both sides are thin shells (< 1,200 lines each)', () => {
    expect(webCanvasView.split('\n').length).toBeLessThan(1200)
    expect(desktopCanvasView.split('\n').length).toBeLessThan(1200)
  })

  it('frame properties carry the canonical wire shape (M2 golden)', () => {
    const properties = createCanvasFrameVariantProperties('standard', { title: 'Frame' })

    expect(properties).toMatchObject({
      title: 'Frame',
      containerRole: 'frame',
      frameVariant: 'standard',
      memberIds: [],
      memberCount: 0
    })
    expect(properties.frameIntent).toBeTruthy()
  })
})
