# 06: React Hooks

> React integration for telemetry reporting and consent management

**Duration:** 1-2 days  
**Dependencies:** [04-telemetry-collector.md](./04-telemetry-collector.md), [03-consent-manager.md](./03-consent-manager.md)

## Overview

Two primary hooks:

1. **useConsent** - Manage user consent preferences
2. **useTelemetry** - Report telemetry from React components

## Implementation

### useConsent Hook

```typescript
// packages/telemetry/src/hooks/useConsent.ts

import { useState, useEffect, useCallback, useContext, createContext, type ReactNode } from 'react'
import type { TelemetryConsent, TelemetryTier } from '../consent/types'
import type { ConsentManager } from '../consent/manager'

// ============ Context ============

interface TelemetryContextValue {
  consent: ConsentManager
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null)

export interface TelemetryProviderProps {
  consent: ConsentManager
  children: ReactNode
}

/**
 * Provider for telemetry context.
 */
export function TelemetryProvider({ consent, children }: TelemetryProviderProps) {
  return (
    <TelemetryContext.Provider value={{ consent }}>
      {children}
    </TelemetryContext.Provider>
  )
}

function useTelemetryContext(): TelemetryContextValue {
  const context = useContext(TelemetryContext)
  if (!context) {
    throw new Error('useTelemetry must be used within a TelemetryProvider')
  }
  return context
}

// ============ useConsent Hook ============

export interface UseConsentReturn {
  /** Current consent configuration */
  current: Readonly<TelemetryConsent>

  /** Current consent tier */
  tier: TelemetryTier

  /** Whether any telemetry is enabled */
  isEnabled: boolean

  /** Whether sharing is enabled */
  isSharingEnabled: boolean

  /** Whether consent has been loaded */
  isLoaded: boolean

  /** Update consent configuration */
  setConsent: (updates: Partial<TelemetryConsent>) => Promise<void>

  /** Set just the tier */
  setTier: (tier: TelemetryTier) => Promise<void>

  /** Reset to defaults (opt out) */
  reset: () => Promise<void>

  /** Check if a tier is allowed */
  allowsTier: (tier: TelemetryTier) => boolean
}

/**
 * Hook for managing telemetry consent.
 */
export function useConsent(): UseConsentReturn {
  const { consent } = useTelemetryContext()
  const [, forceUpdate] = useState({})

  // Subscribe to consent changes
  useEffect(() => {
    const handleChange = () => forceUpdate({})
    consent.on('consent-changed', handleChange)
    return () => consent.off('consent-changed', handleChange)
  }, [consent])

  const setConsent = useCallback(
    (updates: Partial<TelemetryConsent>) => consent.setConsent(updates),
    [consent]
  )

  const setTier = useCallback(
    (tier: TelemetryTier) => consent.setTier(tier),
    [consent]
  )

  const reset = useCallback(
    () => consent.reset(),
    [consent]
  )

  const allowsTier = useCallback(
    (tier: TelemetryTier) => consent.allowsTier(tier),
    [consent]
  )

  return {
    current: consent.current,
    tier: consent.tier,
    isEnabled: consent.isEnabled,
    isSharingEnabled: consent.isSharingEnabled,
    isLoaded: consent.isLoaded,
    setConsent,
    setTier,
    reset,
    allowsTier,
  }
}
```

### useTelemetry Hook

```typescript
// packages/telemetry/src/hooks/useTelemetry.ts

import { useCallback, useRef, useEffect } from 'react'
import type { SchemaIRI } from '@xnet/data'
import type { TelemetryTier } from '../consent/types'
import { TelemetryCollector, type ReportOptions } from '../collection/collector'
import { useTelemetryContext } from './useConsent'

// ============ Context Extension ============

// Extend context to include collector
declare module './useConsent' {
  interface TelemetryContextValue {
    collector?: TelemetryCollector
  }
}

// ============ useTelemetry Hook ============

export interface UseTelemetryOptions {
  /** Schema for this telemetry */
  schemaId?: SchemaIRI

  /** Minimum tier required */
  minTier?: TelemetryTier

  /** Component name for crash context */
  component?: string
}

export interface UseTelemetryReturn {
  /** Whether telemetry is enabled for this tier */
  isEnabled: boolean

  /** Report generic telemetry */
  report: <T extends Record<string, unknown>>(
    schemaId: SchemaIRI,
    data: T,
    options?: ReportOptions
  ) => Promise<string | null>

  /** Report a crash/error */
  reportCrash: (error: Error, context?: Record<string, unknown>) => Promise<string | null>

  /** Report a usage metric */
  reportUsage: (
    metric: string,
    value: number,
    period?: 'daily' | 'weekly' | 'monthly'
  ) => Promise<string | null>
}

/**
 * Hook for reporting telemetry from React components.
 */
export function useTelemetry(options: UseTelemetryOptions = {}): UseTelemetryReturn {
  const { consent, collector } = useTelemetryContext()
  const componentRef = useRef(options.component)

  // Update component ref if it changes
  useEffect(() => {
    componentRef.current = options.component
  }, [options.component])

  const isEnabled = consent.allowsTier(options.minTier ?? 'local')

  const report = useCallback(
    async <T extends Record<string, unknown>>(
      schemaId: SchemaIRI,
      data: T,
      reportOptions?: ReportOptions
    ): Promise<string | null> => {
      if (!collector) {
        console.warn('TelemetryCollector not configured')
        return null
      }
      return collector.report(schemaId, data, reportOptions)
    },
    [collector]
  )

  const reportCrash = useCallback(
    async (error: Error, context?: Record<string, unknown>): Promise<string | null> => {
      if (!collector) {
        console.warn('TelemetryCollector not configured')
        return null
      }
      return collector.reportCrash(error, {
        component: componentRef.current,
        ...context
      })
    },
    [collector]
  )

  const reportUsage = useCallback(
    async (
      metric: string,
      value: number,
      period: 'daily' | 'weekly' | 'monthly' = 'daily'
    ): Promise<string | null> => {
      if (!collector) {
        console.warn('TelemetryCollector not configured')
        return null
      }
      return collector.reportUsage(metric, value, period)
    },
    [collector]
  )

  return {
    isEnabled,
    report,
    reportCrash,
    reportUsage
  }
}
```

### Error Boundary Integration

```typescript
// packages/telemetry/src/hooks/TelemetryErrorBoundary.tsx

import { Component, type ReactNode, type ErrorInfo } from 'react'
import type { TelemetryCollector } from '../collection/collector'

interface Props {
  collector: TelemetryCollector
  children: ReactNode
  fallback?: ReactNode | ((error: Error) => ReactNode)
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary that automatically reports crashes.
 */
export class TelemetryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report to telemetry
    this.props.collector.reportCrash(error, {
      componentStack: errorInfo.componentStack ?? undefined,
      action: 'react_render',
    })

    // Call optional error handler
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props

      if (typeof fallback === 'function') {
        return fallback(this.state.error!)
      }

      return fallback ?? <div>Something went wrong.</div>
    }

    return this.props.children
  }
}
```

### Index Export

```typescript
// packages/telemetry/src/hooks/index.ts

export {
  TelemetryProvider,
  type TelemetryProviderProps,
  useConsent,
  type UseConsentReturn
} from './useConsent'

export { useTelemetry, type UseTelemetryOptions, type UseTelemetryReturn } from './useTelemetry'

export { TelemetryErrorBoundary } from './TelemetryErrorBoundary'
```

## Usage Examples

### App Setup

```tsx
// app/providers.tsx
import { TelemetryProvider } from '@xnet/telemetry/hooks'
import { ConsentManager, TelemetryCollector, LocalStorageConsentStorage } from '@xnet/telemetry'

// Create instances
const consent = new ConsentManager({
  storage: new LocalStorageConsentStorage()
})

const collector = new TelemetryCollector({
  store: nodeStore,
  consent
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TelemetryProvider consent={consent} collector={collector}>
      <TelemetryErrorBoundary collector={collector}>{children}</TelemetryErrorBoundary>
    </TelemetryProvider>
  )
}
```

### Consent Settings UI

```tsx
// components/ConsentSettings.tsx
import { useConsent } from '@xnet/telemetry/hooks'

export function ConsentSettings() {
  const { tier, setTier, current, isLoaded } = useConsent()

  if (!isLoaded) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h2>Telemetry Settings</h2>

      <label>
        <input type="radio" checked={tier === 'off'} onChange={() => setTier('off')} />
        Off - No data collected
      </label>

      <label>
        <input type="radio" checked={tier === 'local'} onChange={() => setTier('local')} />
        Local only - For your own debugging
      </label>

      <label>
        <input type="radio" checked={tier === 'crashes'} onChange={() => setTier('crashes')} />
        Crashes - Send crash reports (recommended)
      </label>

      <label>
        <input type="radio" checked={tier === 'anonymous'} onChange={() => setTier('anonymous')} />
        Anonymous - Crashes + usage metrics
      </label>

      <p>Review before sending: {current.reviewBeforeSend ? 'Yes' : 'No'}</p>
    </div>
  )
}
```

### Component with Telemetry

```tsx
// components/DataGrid.tsx
import { useTelemetry } from '@xnet/telemetry/hooks'

export function DataGrid({ data }: { data: any[] }) {
  const telemetry = useTelemetry({ component: 'DataGrid' })

  const handleSort = async (column: string) => {
    try {
      // Sorting logic...
      performSort(column)
    } catch (error) {
      // Automatically reports with component context
      await telemetry.reportCrash(error as Error, {
        action: 'sort',
        column,
        rowCount: data.length
      })
      throw error
    }
  }

  return <table>{/* ... */}</table>
}
```

## Tests

```typescript
// packages/telemetry/test/hooks.test.tsx

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { TelemetryProvider, useConsent, useTelemetry } from '../src/hooks'
import { ConsentManager, MemoryConsentStorage } from '../src/consent'
import { TelemetryCollector } from '../src/collection/collector'

describe('useConsent', () => {
  let consent: ConsentManager

  beforeEach(() => {
    consent = new ConsentManager({
      storage: new MemoryConsentStorage(),
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TelemetryProvider consent={consent}>
      {children}
    </TelemetryProvider>
  )

  it('should return current consent state', () => {
    const { result } = renderHook(() => useConsent(), { wrapper })

    expect(result.current.tier).toBe('off')
    expect(result.current.isEnabled).toBe(false)
  })

  it('should update tier', async () => {
    const { result } = renderHook(() => useConsent(), { wrapper })

    await act(async () => {
      await result.current.setTier('crashes')
    })

    expect(result.current.tier).toBe('crashes')
    expect(result.current.isEnabled).toBe(true)
  })

  it('should check tier allowance', async () => {
    const { result } = renderHook(() => useConsent(), { wrapper })

    await act(async () => {
      await result.current.setTier('crashes')
    })

    expect(result.current.allowsTier('local')).toBe(true)
    expect(result.current.allowsTier('crashes')).toBe(true)
    expect(result.current.allowsTier('anonymous')).toBe(false)
  })
})

describe('useTelemetry', () => {
  let consent: ConsentManager
  let collector: TelemetryCollector

  beforeEach(async () => {
    consent = new ConsentManager({
      storage: new MemoryConsentStorage(),
    })

    // Mock collector
    collector = {
      report: vi.fn().mockResolvedValue('node-1'),
      reportCrash: vi.fn().mockResolvedValue('node-2'),
      reportUsage: vi.fn().mockResolvedValue('node-3'),
    } as unknown as TelemetryCollector
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TelemetryProvider consent={consent} collector={collector}>
      {children}
    </TelemetryProvider>
  )

  it('should report crashes with component context', async () => {
    const { result } = renderHook(
      () => useTelemetry({ component: 'TestComponent' }),
      { wrapper }
    )

    await act(async () => {
      await consent.setTier('crashes')
    })

    const error = new Error('test error')
    await act(async () => {
      await result.current.reportCrash(error, { action: 'test' })
    })

    expect(collector.reportCrash).toHaveBeenCalledWith(error, {
      component: 'TestComponent',
      action: 'test',
    })
  })
})
```

## Checklist

- [ ] Create TelemetryContext and TelemetryProvider
- [ ] Implement useConsent hook
- [ ] Implement useTelemetry hook
- [ ] Create TelemetryErrorBoundary component
- [ ] Export from hooks/index.ts
- [ ] Write tests for useConsent
- [ ] Write tests for useTelemetry
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Scrubbing & Bucketing](./05-scrubbing-and-bucketing.md) | [Next: Connection Limits](./07-connection-limits.md)
