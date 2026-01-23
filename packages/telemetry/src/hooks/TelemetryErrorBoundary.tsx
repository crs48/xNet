/**
 * TelemetryErrorBoundary - Error boundary that automatically reports crashes.
 */

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
 * Error boundary that automatically reports crashes to telemetry.
 *
 * @example
 * ```tsx
 * <TelemetryErrorBoundary
 *   collector={collector}
 *   fallback={<div>Something went wrong</div>}
 * >
 *   <App />
 * </TelemetryErrorBoundary>
 * ```
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
    this.props.collector.reportCrash(error, {
      codeNamespace: 'react',
      codeFunction: 'render',
      userAction: errorInfo.componentStack?.slice(0, 200) ?? undefined
    })

    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props

      if (typeof fallback === 'function') {
        return fallback(this.state.error!)
      }

      return fallback ?? null
    }

    return this.props.children
  }
}
