import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeProvider'

/**
 * Covers the 0232 additions: the `cozy` colour variant and the `density` axis
 * are applied to the document root as `data-variant` / `data-density`, persist
 * under the provider's storageKey, and leave `compact`/`default` attribute-free
 * so the historical IDE feel is an unchanged default (no regression).
 */

function Controls() {
  const { variant, setVariant, density, setDensity } = useTheme()
  return (
    <div>
      <span data-testid="variant">{variant}</span>
      <span data-testid="density">{density}</span>
      <button onClick={() => setVariant('cozy')}>cozy</button>
      <button onClick={() => setVariant('default')}>default-variant</button>
      <button onClick={() => setDensity('comfortable')}>comfortable</button>
      <button onClick={() => setDensity('compact')}>compact</button>
    </div>
  )
}

const KEY = 'test-theme'

function renderProvider() {
  return render(
    <ThemeProvider storageKey={KEY} enableSystem={false} defaultTheme="light">
      <Controls />
    </ThemeProvider>
  )
}

describe('ThemeProvider — cozy variant + density axis (0232)', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.variant
    delete document.documentElement.dataset.density
    // jsdom has no matchMedia; the provider reads it for the system theme.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to monochrome + compact with no root attributes (no regression)', () => {
    renderProvider()
    expect(screen.getByTestId('variant').textContent).toBe('default')
    expect(screen.getByTestId('density').textContent).toBe('compact')
    expect(document.documentElement.dataset.variant).toBeUndefined()
    expect(document.documentElement.dataset.density).toBeUndefined()
  })

  it('applies and persists the cozy variant', () => {
    renderProvider()
    act(() => {
      fireEvent.click(screen.getByText('cozy'))
    })
    expect(document.documentElement.dataset.variant).toBe('cozy')
    expect(localStorage.getItem(`${KEY}-variant`)).toBe('cozy')
  })

  it('applies and persists comfortable density, and clears it on compact', () => {
    renderProvider()
    act(() => {
      fireEvent.click(screen.getByText('comfortable'))
    })
    expect(document.documentElement.dataset.density).toBe('comfortable')
    expect(localStorage.getItem(`${KEY}-density`)).toBe('comfortable')

    act(() => {
      fireEvent.click(screen.getByText('compact'))
    })
    expect(document.documentElement.dataset.density).toBeUndefined()
    expect(localStorage.getItem(`${KEY}-density`)).toBe('compact')
  })

  it('restores a persisted cozy + comfortable selection on mount', () => {
    localStorage.setItem(`${KEY}-variant`, 'cozy')
    localStorage.setItem(`${KEY}-density`, 'comfortable')
    renderProvider()
    expect(screen.getByTestId('variant').textContent).toBe('cozy')
    expect(screen.getByTestId('density').textContent).toBe('comfortable')
    expect(document.documentElement.dataset.variant).toBe('cozy')
    expect(document.documentElement.dataset.density).toBe('comfortable')
  })

  it('treats variant and density as orthogonal axes', () => {
    renderProvider()
    act(() => {
      fireEvent.click(screen.getByText('cozy'))
      fireEvent.click(screen.getByText('comfortable'))
    })
    expect(document.documentElement.dataset.variant).toBe('cozy')
    expect(document.documentElement.dataset.density).toBe('comfortable')
    // Dropping the colour variant leaves density untouched.
    act(() => {
      fireEvent.click(screen.getByText('default-variant'))
    })
    expect(document.documentElement.dataset.variant).toBeUndefined()
    expect(document.documentElement.dataset.density).toBe('comfortable')
  })
})
