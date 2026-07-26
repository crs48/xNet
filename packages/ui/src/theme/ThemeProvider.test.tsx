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

/**
 * Covers the 0399 addition: per-TOKEN value overrides. Point-and-change writes
 * here when a user retints something, and the distinction that matters is that
 * the map is keyed by custom-property name — never by element — so it stays a
 * change to the representation the stylesheet already uses rather than a second
 * source of truth layered on top of it.
 */
function TokenControls() {
  const { tokenOverrides, setToken, clearToken, clearTokens } = useTheme()
  return (
    <div>
      <span data-testid="overrides">{JSON.stringify(tokenOverrides)}</span>
      <button onClick={() => setToken('--accent', '210 90% 60%')}>set-accent</button>
      <button onClick={() => setToken('--accent', '0 0% 10%')}>set-accent-again</button>
      <button onClick={() => setToken('--surface-1', '0 0% 12%')}>set-surface</button>
      <button onClick={() => clearToken('--accent')}>clear-accent</button>
      <button onClick={() => clearTokens()}>clear-all</button>
    </div>
  )
}

function renderTokenProvider() {
  return render(
    <ThemeProvider storageKey={KEY} enableSystem={false} defaultTheme="light">
      <TokenControls />
    </ThemeProvider>
  )
}

describe('ThemeProvider — token overrides (0399)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.style.removeProperty('--surface-1')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.style.removeProperty('--surface-1')
  })

  it('starts with no overrides and touches no custom properties', () => {
    renderTokenProvider()
    expect(screen.getByTestId('overrides').textContent).toBe('{}')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
  })

  it('applies a token as an inline custom property on :root', () => {
    renderTokenProvider()
    act(() => {
      fireEvent.click(screen.getByText('set-accent'))
    })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('210 90% 60%')
    expect(screen.getByTestId('overrides').textContent).toContain('--accent')
  })

  it('clearing a token REMOVES the property so the stylesheet value wins again', () => {
    renderTokenProvider()
    act(() => {
      fireEvent.click(screen.getByText('set-accent'))
    })
    act(() => {
      fireEvent.click(screen.getByText('clear-accent'))
    })
    // Not "set back to the old value" — an inline copy would shadow the
    // stylesheet forever and stop following theme/variant changes.
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
  })

  it('keeps other overrides when one is cleared', () => {
    renderTokenProvider()
    act(() => {
      fireEvent.click(screen.getByText('set-accent'))
      fireEvent.click(screen.getByText('set-surface'))
    })
    act(() => {
      fireEvent.click(screen.getByText('clear-accent'))
    })
    expect(document.documentElement.style.getPropertyValue('--surface-1')).toBe('0 0% 12%')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
  })

  it('clearTokens drops every override', () => {
    renderTokenProvider()
    act(() => {
      fireEvent.click(screen.getByText('set-accent'))
      fireEvent.click(screen.getByText('set-surface'))
    })
    act(() => {
      fireEvent.click(screen.getByText('clear-all'))
    })
    expect(screen.getByTestId('overrides').textContent).toBe('{}')
    expect(document.documentElement.style.getPropertyValue('--surface-1')).toBe('')
  })

  it('persists overrides under the storage key', () => {
    renderTokenProvider()
    act(() => {
      fireEvent.click(screen.getByText('set-accent'))
    })
    expect(JSON.parse(localStorage.getItem(`${KEY}-tokens`) as string)).toEqual({
      '--accent': '210 90% 60%'
    })
  })

  it('restores persisted overrides on mount', () => {
    localStorage.setItem(`${KEY}-tokens`, JSON.stringify({ '--accent': '1 2% 3%' }))
    renderTokenProvider()
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('1 2% 3%')
  })

  it('treats a malformed stored value as NO overrides, not a partial theme', () => {
    localStorage.setItem(`${KEY}-tokens`, '["not", "a", "map"]')
    renderTokenProvider()
    expect(screen.getByTestId('overrides').textContent).toBe('{}')
  })

  it('drops stored entries that are not token names or not strings', () => {
    localStorage.setItem(
      `${KEY}-tokens`,
      JSON.stringify({ '--accent': '1 2% 3%', 'not-a-token': 'x', '--bad': 5 })
    )
    renderTokenProvider()
    expect(JSON.parse(screen.getByTestId('overrides').textContent as string)).toEqual({
      '--accent': '1 2% 3%'
    })
  })
})
