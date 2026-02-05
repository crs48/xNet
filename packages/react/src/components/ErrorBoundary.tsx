/**
 * Global error boundary for xNet React apps.
 *
 * Catches unhandled React render errors and displays a recovery UI
 * instead of crashing the entire app tree.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react'

// ─── Types ──────────────────────────────────────────────────

export type ErrorBoundaryFallbackProps = {
  error: Error
  reset: () => void
}

export type ErrorBoundaryProps = {
  children: ReactNode
  /** Custom fallback UI. Receives error + reset function. If omitted, a default error screen is shown. */
  fallback?: ReactNode | ((props: ErrorBoundaryFallbackProps) => ReactNode)
  /** Callback fired when an error is caught. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /** Change this value to force a reset (e.g. after navigation). */
  resetKey?: string | number
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

// ─── Component ──────────────────────────────────────────────

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      this.props.resetKey !== undefined &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.handleReset()
    }
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error ?? new Error('Unknown error'),
          reset: this.handleReset
        })
      }
      return this.props.fallback
    }

    return (
      <div
        role="alert"
        style={{
          padding: '2rem',
          textAlign: 'center',
          maxWidth: '480px',
          margin: '4rem auto'
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Something went wrong
        </h2>
        <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </p>
        <button
          onClick={this.handleReset}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: '1px solid #ccc',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Try again
        </button>
      </div>
    )
  }
}
