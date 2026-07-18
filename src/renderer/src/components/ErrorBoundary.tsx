import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** When set, renders this instead of the full-screen crash UI (e.g. for isolating one widget/panel). */
  compactLabel?: string
}

interface State {
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.compactLabel) {
        return (
          <div className="crash-inline" title={this.state.error.message}>
            {this.props.compactLabel}: {this.state.error.message}
          </div>
        )
      }
      return (
        <div className="crash-screen">
          <div className="crash-screen__title">Something went wrong</div>
          <div className="crash-screen__message">{this.state.error.message}</div>
          <button className="import-button" onClick={() => this.setState({ error: null })}>
            Try to recover
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
