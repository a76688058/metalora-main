import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Suppress logging here as we already patched console.error
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="w-full h-full flex items-center justify-center p-4 text-center bg-zinc-900/50 rounded-lg border border-white/10">
          <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-widest">비주얼 로드 실패</h2>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
