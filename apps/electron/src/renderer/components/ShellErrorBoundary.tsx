/**
 * Catches render failures anywhere in the desktop shell (exploration 0406).
 *
 * A browser tab that white-screens still has a URL bar and a reload button. A
 * packaged desktop window has neither: an unmounted React tree is a dead app
 * the user can only fix by quitting. That is what happened when `MenuLabel`
 * rendered Base UI's `GroupLabel` outside a group — opening the system menu,
 * the shell's only navigation affordance, blanked the whole window.
 *
 * So the boundary degrades to a recoverable panel and reports loudly rather
 * than swallowing: a shell crash that logs nothing reads as "the app is fine".
 */

import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ShellErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[shell] render failure', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleDismiss = (): void => {
    this.setState({ error: null })
  }

  render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-1 p-6 shadow-2xl">
          <h1 className="text-lg font-semibold text-foreground">Something broke in the shell</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            The rest of the app kept running. Reloading restores the window; your data is
            unaffected.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-surface-2 p-3 text-xs text-foreground-muted">
            {error.message}
          </pre>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={this.handleDismiss}
              className="rounded-lg px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
