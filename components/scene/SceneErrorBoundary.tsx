'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[SceneErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-void">
          <div className="panel corner-bracket p-6 max-w-md text-center">
            <div className="terminal text-xs text-cyan-glow/70 mb-2">// RENDER FAULT</div>
            <div className="text-sm text-op-red mb-3">WebGL scene failed to render.</div>
            <p className="terminal text-xs text-t-3 mb-4">{this.state.error.message}</p>
            <button
              type="button"
              className="op-btn"
              onClick={() => this.setState({ error: null })}
            >
              Retry scene
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
