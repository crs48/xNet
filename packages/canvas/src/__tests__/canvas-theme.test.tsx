import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollapsibleMinimap } from '../components/Minimap'
import { NavigationTools } from '../components/NavigationTools'
import { Viewport } from '../spatial/index'
import { resolveCanvasThemeTokens } from '../theme/canvas-theme'

let canvasGetContextSpy: ReturnType<typeof vi.spyOn> | null = null

beforeEach(() => {
  canvasGetContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((contextId: string) => {
      if (contextId !== '2d') {
        return null
      }

      return {
        scale: () => undefined,
        fillRect: () => undefined,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        stroke: () => undefined,
        strokeRect: () => undefined,
        clearRect: () => undefined,
        setTransform: () => undefined,
        fill: () => undefined,
        closePath: () => undefined,
        quadraticCurveTo: () => undefined
      } as unknown as CanvasRenderingContext2D
    })
})

afterEach(() => {
  cleanup()
  canvasGetContextSpy?.mockRestore()
  canvasGetContextSpy = null
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
})

function createViewport(): Viewport {
  return new Viewport({
    x: 0,
    y: 0,
    zoom: 1,
    width: 1280,
    height: 720
  })
}

describe('canvas theme tokens', () => {
  it('resolves light mode fallbacks without CSS variables', () => {
    document.documentElement.className = 'light'

    const tokens = resolveCanvasThemeTokens(document.documentElement)

    expect(tokens.mode).toBe('light')
    expect(tokens.surfaceBackground).toContain('hsl(')
    expect(tokens.gridColor[3]).toBeGreaterThan(0)
  })

  it('resolves dark mode fallbacks without CSS variables', () => {
    document.documentElement.className = 'dark'

    const tokens = resolveCanvasThemeTokens(document.documentElement)

    expect(tokens.mode).toBe('dark')
    expect(tokens.panelBackground).toContain('hsl(')
    expect(tokens.majorGridColor[3]).toBeGreaterThan(tokens.gridColor[3])
  })
})

describe('theme-aware canvas chrome', () => {
  it('updates navigation tools when the document theme changes', async () => {
    document.documentElement.className = 'light'

    render(
      <NavigationTools
        viewport={createViewport()}
        canvasBounds={{ x: 0, y: 0, width: 400, height: 300 }}
        onViewportChange={() => undefined}
      />
    )

    const zoomInButton = screen.getByRole('button', { name: 'Zoom in' })
    const toolbar = zoomInButton.closest('.navigation-tools')

    expect(toolbar?.dataset.canvasTheme).toBe('light')

    document.documentElement.className = 'dark'

    await waitFor(() => {
      expect(toolbar?.dataset.canvasTheme).toBe('dark')
    })
  })

  it('updates the minimap shell when the document theme changes', async () => {
    document.documentElement.className = 'dark'

    const viewport = createViewport()
    const { container } = render(
      <CollapsibleMinimap
        nodes={[
          {
            id: 'page-1',
            type: 'page',
            position: { x: 0, y: 0, width: 240, height: 180 },
            properties: {}
          }
        ]}
        edges={[]}
        viewport={viewport}
        onViewportChange={() => undefined}
      />
    )

    const minimap = container.querySelector<HTMLElement>('[data-canvas-minimap="true"]')
    expect(minimap?.dataset.canvasTheme).toBe('dark')

    document.documentElement.className = 'light'

    await waitFor(() => {
      expect(minimap?.dataset.canvasTheme).toBe('light')
    })
  })
})
