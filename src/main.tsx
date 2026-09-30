import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6 text-neutral-900 font-sans">
          <div className="max-w-md w-full bg-white p-6 rounded-lg border border-neutral-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm">
                !
              </div>
              <h2 className="text-base font-semibold text-neutral-900">Application Initialization Issue</h2>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              An unexpected error occurred during rendering. You can restore the default application state below:
            </p>
            {this.state.error?.message && (
              <pre className="p-3 bg-neutral-50 rounded border border-neutral-200 text-[11px] font-mono text-neutral-700 overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-2 px-4 bg-neutral-900 text-white rounded text-xs font-medium hover:bg-neutral-800 transition-colors"
            >
              Reset Application Cache &amp; Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}
