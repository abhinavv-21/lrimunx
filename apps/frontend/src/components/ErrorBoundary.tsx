import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence. Without this, any throw during render unmounts the
 * whole tree and the user is left staring at an empty canvas with no clue what
 * broke — which is exactly the failure this was added in response to.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] unhandled render error', error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-4">
        <div className="w-full max-w-prose rounded-card border border-danger bg-danger-wash p-6">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={20} className="shrink-0 text-danger" aria-hidden />
            <h1 className="text-h2 text-ink">Something broke while rendering</h1>
          </div>

          <p className="mt-3 text-body text-ink-secondary">
            This is a bug in the app, not something you did. The details below are also in the
            browser console.
          </p>

          <pre className="mt-4 max-h-64 overflow-auto rounded-control bg-surface p-3 font-mono text-data text-ink">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex min-h-tap items-center rounded-control bg-accent px-5 font-medium text-white transition-colors duration-micro hover:bg-accent-hover md:min-h-10"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
