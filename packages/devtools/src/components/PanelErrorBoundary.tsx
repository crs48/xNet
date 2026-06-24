/**
 * A small error boundary so a single panel (e.g. the data grid rendering
 * arbitrary, possibly-malformed node data) can fail without taking down the
 * whole devtools surface. Shows the error + a Retry that remounts children.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional label shown in the fallback ("… in the Data panel"). */
  label?: string
}

interface State {
  error: Error | null
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console for the Logs panel / devtools to pick up.
    console.error('[DevTools] panel error', this.props.label ?? '', error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
          <p className="text-xs text-destructive font-medium">
            This panel hit an error{this.props.label ? ` (${this.props.label})` : ''}.
          </p>
          <pre className="text-[10px] text-ink-3 max-w-full overflow-auto max-h-32 whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button
            onClick={this.reset}
            className="text-xs px-2 py-0.5 rounded border border-hairline text-ink-2 hover:text-ink-1 hover:bg-surface-2"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
