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
        <main className="error-boundary-shell" role="alert">
          <div className="error-boundary-card">
            <h1>Something went wrong</h1>
            <p>
              An unexpected error interrupted QueueFlow AI. Your data is safe. Please reload the page
              to continue.
            </p>
            <button className="action-button" type="button" onClick={this.handleReload}>
              Reload page
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
