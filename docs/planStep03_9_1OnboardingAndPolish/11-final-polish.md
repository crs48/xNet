# 11: Final Polish

> Error handling, loading states, offline indicators, and accessibility

**Duration:** 3 days
**Dependencies:** All previous phases complete

## Overview

The final polish phase ensures xNet feels professional and handles edge cases gracefully. Users should never see raw errors, unexplained loading states, or wonder if the app is working.

## Implementation

### 1. Global Error Boundary

```typescript
// packages/react/src/components/ErrorBoundary.tsx

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
    this.props.onError?.(error, errorInfo)

    // Report to telemetry (if enabled)
    if (typeof window !== 'undefined' && window.__xnet_telemetry__) {
      window.__xnet_telemetry__.captureError(error, { componentStack: errorInfo.componentStack })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultErrorFallback error={this.state.error} />
    }

    return this.props.children
  }
}

function DefaultErrorFallback({ error }: { error: Error | null }) {
  const handleReload = () => {
    window.location.reload()
  }

  const handleReport = () => {
    const subject = encodeURIComponent(`Bug Report: ${error?.message ?? 'Unknown error'}`)
    const body = encodeURIComponent(`
Error: ${error?.message}
Stack: ${error?.stack}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}
Time: ${new Date().toISOString()}
    `)
    window.open(`mailto:support@xnet.dev?subject=${subject}&body=${body}`)
  }

  return (
    <div className="error-fallback">
      <div className="error-icon">
        <AlertTriangleIcon size={48} />
      </div>

      <h1>Something went wrong</h1>
      <p>We're sorry, but something unexpected happened.</p>

      {error && (
        <details className="error-details">
          <summary>Technical details</summary>
          <pre>{error.message}</pre>
        </details>
      )}

      <div className="error-actions">
        <button onClick={handleReload} className="primary-button">
          Reload Page
        </button>
        <button onClick={handleReport} className="secondary-button">
          Report Issue
        </button>
      </div>
    </div>
  )
}
```

### 2. Async Error Handling

```typescript
// packages/react/src/hooks/useAsyncAction.ts

import { useState, useCallback } from 'react'

interface AsyncActionState<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
}

interface AsyncActionResult<T, Args extends unknown[]> {
  state: AsyncActionState<T>
  execute: (...args: Args) => Promise<T | null>
  reset: () => void
}

export function useAsyncAction<T, Args extends unknown[]>(
  action: (...args: Args) => Promise<T>,
  options?: {
    onSuccess?: (data: T) => void
    onError?: (error: Error) => void
  }
): AsyncActionResult<T, Args> {
  const [state, setState] = useState<AsyncActionState<T>>({
    data: null,
    error: null,
    isLoading: false
  })

  const execute = useCallback(async (...args: Args): Promise<T | null> => {
    setState({ data: null, error: null, isLoading: true })

    try {
      const result = await action(...args)
      setState({ data: result, error: null, isLoading: false })
      options?.onSuccess?.(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setState({ data: null, error, isLoading: false })
      options?.onError?.(error)
      return null
    }
  }, [action, options])

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false })
  }, [])

  return { state, execute, reset }
}

// Usage example
function SaveButton() {
  const { state, execute } = useAsyncAction(
    async () => {
      await saveDocument()
      return 'saved'
    },
    {
      onSuccess: () => toast.success('Saved!'),
      onError: (err) => toast.error(`Save failed: ${err.message}`)
    }
  )

  return (
    <button onClick={() => execute()} disabled={state.isLoading}>
      {state.isLoading ? <Spinner /> : 'Save'}
    </button>
  )
}
```

### 3. Loading States & Skeletons

```typescript
// packages/react/src/components/Skeleton.tsx

interface SkeletonProps {
  width?: string | number
  height?: string | number
  variant?: 'text' | 'circular' | 'rectangular'
  animation?: 'pulse' | 'wave' | 'none'
}

export function Skeleton({
  width = '100%',
  height = '1em',
  variant = 'text',
  animation = 'pulse'
}: SkeletonProps) {
  const style = {
    width,
    height,
    borderRadius: variant === 'circular' ? '50%' : variant === 'text' ? '4px' : '8px'
  }

  return <div className={`skeleton skeleton-${animation}`} style={style} />
}

// Composed skeletons
export function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <Skeleton variant="text" width="60%" height="2em" />
      <div className="skeleton-spacer" />
      <Skeleton variant="text" width="100%" />
      <Skeleton variant="text" width="95%" />
      <Skeleton variant="text" width="85%" />
      <div className="skeleton-spacer" />
      <Skeleton variant="text" width="100%" />
      <Skeleton variant="text" width="90%" />
      <Skeleton variant="text" width="70%" />
    </div>
  )
}

export function DatabaseSkeleton() {
  return (
    <div className="database-skeleton">
      <div className="skeleton-header">
        <Skeleton variant="text" width="40%" height="1.5em" />
        <Skeleton variant="rectangular" width="100px" height="32px" />
      </div>
      <div className="skeleton-table">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton-row">
            <Skeleton variant="text" width="100%" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SidebarSkeleton() {
  return (
    <div className="sidebar-skeleton">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="skeleton-nav-item">
          <Skeleton variant="circular" width={20} height={20} />
          <Skeleton variant="text" width="70%" />
        </div>
      ))}
    </div>
  )
}
```

```css
/* Skeleton animations */
.skeleton {
  background: var(--skeleton-bg, #e0e0e0);
  position: relative;
  overflow: hidden;
}

.skeleton-pulse {
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.skeleton-wave::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: skeleton-wave 1.5s linear infinite;
}

@keyframes skeleton-wave {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
```

### 4. Offline Indicator

```typescript
// packages/react/src/components/OfflineIndicator.tsx

import { useState, useEffect } from 'react'
import { useHub } from '../hooks/useHub'

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const { isConnected, pendingChanges } = useHub()

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Fully online and synced
  if (isOnline && isConnected && pendingChanges === 0) {
    return null
  }

  return (
    <div className={`offline-indicator ${!isOnline ? 'offline' : 'syncing'}`}>
      {!isOnline ? (
        <>
          <WifiOffIcon size={16} />
          <span>Offline - changes saved locally</span>
        </>
      ) : !isConnected ? (
        <>
          <CloudOffIcon size={16} />
          <span>Connecting to sync server...</span>
        </>
      ) : pendingChanges > 0 ? (
        <>
          <CloudSyncIcon size={16} className="spin" />
          <span>Syncing {pendingChanges} changes...</span>
        </>
      ) : null}
    </div>
  )
}
```

```css
.offline-indicator {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--surface-primary);
  border: 1px solid var(--border);
  border-radius: 9999px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-size: 0.875rem;
  z-index: 100;
  animation: slide-up 0.3s ease;
}

.offline-indicator.offline {
  background: var(--warning-bg);
  border-color: var(--warning-border);
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(1rem);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```

### 5. Accessibility Audit Checklist

```typescript
// packages/react/src/hooks/useAnnounce.ts

/**
 * Hook for accessible announcements via aria-live regions
 */
export function useAnnounce() {
  const announce = useCallback((
    message: string,
    priority: 'polite' | 'assertive' = 'polite'
  ) => {
    const region = document.getElementById(`aria-live-${priority}`)
    if (region) {
      region.textContent = message
      // Clear after announcement
      setTimeout(() => {
        region.textContent = ''
      }, 1000)
    }
  }, [])

  return { announce }
}

// Add to app root
function AriaLiveRegions() {
  return (
    <>
      <div
        id="aria-live-polite"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        id="aria-live-assertive"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </>
  )
}
```

```typescript
// Accessibility audit script
// scripts/a11y-audit.ts

import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

async function runAccessibilityAudit() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const routes = ['/', '/workspace', '/settings', '/page/sample', '/database/sample']

  const results: Record<string, any[]> = {}

  for (const route of routes) {
    await page.goto(`http://localhost:3000${route}`)
    await page.waitForLoadState('networkidle')

    const accessibilityResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    results[route] = accessibilityResults.violations

    if (accessibilityResults.violations.length > 0) {
      console.log(`\n${route}: ${accessibilityResults.violations.length} issues`)
      for (const violation of accessibilityResults.violations) {
        console.log(`  - ${violation.id}: ${violation.description}`)
        console.log(`    Impact: ${violation.impact}`)
        console.log(`    Nodes: ${violation.nodes.length}`)
      }
    } else {
      console.log(`${route}: No issues`)
    }
  }

  await browser.close()

  // Fail if critical issues
  const criticalIssues = Object.values(results)
    .flat()
    .filter((v) => v.impact === 'critical')

  if (criticalIssues.length > 0) {
    console.error(`\nFailed: ${criticalIssues.length} critical accessibility issues`)
    process.exit(1)
  }

  console.log('\nAccessibility audit passed!')
}

runAccessibilityAudit()
```

### 6. Focus Management

```typescript
// packages/react/src/hooks/useFocusTrap.ts

import { useEffect, useRef } from 'react'

export function useFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const focusableSelector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ')

    const getFocusableElements = () => {
      return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector))
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusable = getFocusableElements()
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    // Focus first element on mount
    const focusable = getFocusableElements()
    if (focusable.length > 0) {
      focusable[0].focus()
    }

    element.addEventListener('keydown', handleKeyDown)
    return () => element.removeEventListener('keydown', handleKeyDown)
  }, [])

  return ref
}

// Usage in Dialog
function Dialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>()

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
```

### 7. Keyboard Shortcuts

```typescript
// packages/react/src/hooks/useKeyboardShortcuts.ts

interface Shortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description: string
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return
      }

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey || e.metaKey : !(e.ctrlKey || e.metaKey)
        const metaMatch = shortcut.meta ? e.metaKey : !e.metaKey
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey
        const altMatch = shortcut.alt ? e.altKey : !e.altKey
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}

// Global shortcuts
const globalShortcuts: Shortcut[] = [
  { key: 'k', ctrl: true, action: openSearch, description: 'Open search' },
  { key: 'n', ctrl: true, action: createPage, description: 'New page' },
  { key: ',', ctrl: true, action: openSettings, description: 'Settings' },
  { key: '/', action: openHelp, description: 'Show shortcuts' }
]
```

### 8. Performance Polish

```typescript
// Virtualized lists for large data
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualizedList({ items }: { items: any[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5
  })

  return (
    <div ref={parentRef} className="list-container">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <ListItem item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Testing

```typescript
describe('Polish', () => {
  describe('Error Boundary', () => {
    it('catches and displays errors', () => {
      const ThrowError = () => {
        throw new Error('Test error')
      }

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('page has no critical violations', async () => {
      const { container } = render(<App />)
      const results = await axe(container)

      const critical = results.violations.filter(v => v.impact === 'critical')
      expect(critical).toHaveLength(0)
    })

    it('focus trap works in dialog', async () => {
      render(<Dialog>Content</Dialog>)

      const focusable = screen.getAllByRole('button')
      expect(document.activeElement).toBe(focusable[0])

      await userEvent.tab()
      expect(document.activeElement).toBe(focusable[1])

      // Tab from last wraps to first
      await userEvent.tab()
      expect(document.activeElement).toBe(focusable[0])
    })
  })

  describe('Offline', () => {
    it('shows indicator when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
      window.dispatchEvent(new Event('offline'))

      render(<OfflineIndicator />)

      expect(screen.getByText(/offline/i)).toBeInTheDocument()
    })
  })
})
```

### 9. Demo-Specific Polish

When connected to the demo hub (`hub.xnet.fyi`), additional UI elements help users understand the ephemeral nature and guide graduation:

```typescript
// packages/react/src/components/DemoBanner.tsx

export function DemoBanner({ demoLimits }: { demoLimits: DemoLimits }) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="demo-banner" role="status">
      <InfoIcon size={16} />
      <span>
        Demo mode — data expires after 24h of inactivity.
        {' '}<a href="/download">Download the desktop app</a> to keep your data.
      </span>
      <button
        className="dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss demo banner"
      >
        <XIcon size={14} />
      </button>
    </div>
  )
}

// packages/react/src/components/DemoQuotaIndicator.tsx

export function DemoQuotaIndicator({ used, limit }: { used: number; limit: number }) {
  const percentage = Math.min((used / limit) * 100, 100)
  const isNearLimit = percentage > 80

  return (
    <div className={`quota-indicator ${isNearLimit ? 'warning' : ''}`}>
      <div className="quota-bar">
        <div className="quota-fill" style={{ width: `${percentage}%` }} />
      </div>
      <span className="quota-text">
        {formatBytes(used)} / {formatBytes(limit)}
      </span>
      {isNearLimit && (
        <span className="quota-warning">
          Running low — <a href="/download">upgrade to desktop</a>
        </span>
      )}
    </div>
  )
}

// packages/react/src/components/DemoDataExpired.tsx
// Shown when user returns after eviction

export function DemoDataExpiredScreen() {
  return (
    <div className="onboarding-screen data-expired">
      <div className="icon">
        <ClockIcon size={48} />
      </div>

      <h1>Your demo data has expired</h1>

      <p>
        Demo data is automatically removed after 24 hours of inactivity.
        Your identity is still safe — it's stored in your passkey.
      </p>

      <button className="primary-button" onClick={createNewWorkspace}>
        Start fresh
      </button>

      <a href="/download" className="secondary-button">
        Download desktop app (data never expires)
      </a>
    </div>
  )
}
```

```css
.demo-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--info-bg);
  border-bottom: 1px solid var(--info-border);
  font-size: 0.875rem;
}

.demo-banner .dismiss {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
}

.quota-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.quota-bar {
  width: 60px;
  height: 4px;
  background: var(--surface-tertiary);
  border-radius: 2px;
  overflow: hidden;
}

.quota-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.3s;
}

.quota-indicator.warning .quota-fill {
  background: var(--warning);
}
```

## Validation Gate

- [ ] Error boundary catches React errors gracefully
- [ ] Async errors show user-friendly messages
- [ ] All async operations show loading states
- [ ] Skeleton screens for all loading content
- [ ] Offline indicator shows when disconnected
- [ ] Pending changes counter shows during sync
- [ ] No critical accessibility violations
- [ ] Focus management works in dialogs
- [ ] Keyboard shortcuts work
- [ ] Screen reader can navigate main flows
- [ ] Large lists are virtualized
- [ ] No unhandled promise rejections in console
- [ ] **Demo banner** shows when connected to demo hub
- [ ] **Quota indicator** shows usage and warns near limit
- [ ] **Data expired screen** shows graceful recovery after eviction
- [ ] **Graduation CTAs** (download desktop app) visible throughout demo experience

---

[Back to README](./README.md)
