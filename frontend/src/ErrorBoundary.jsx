import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface render-time errors to the console for debugging without
    // crashing the whole app into a blank white screen.
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="qf-errorboundary" role="alert">
          <div className="qf-empty qf-empty--danger">
            <div className="qf-empty__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <p className="qf-empty__title">Something went wrong</p>
            <p className="qf-empty__message">
              An unexpected error interrupted QueueFlow AI. Your data is safe — reload the page to
              continue.
            </p>
            <div className="qf-empty__action">
              <button className="qf-btn qf-btn--primary" type="button" onClick={this.handleReload}>
                Reload page
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
