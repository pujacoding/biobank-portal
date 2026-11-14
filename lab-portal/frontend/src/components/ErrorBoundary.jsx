import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-card" style={{
          padding: '32px',
          maxWidth: '700px',
          margin: '40px auto',
          textAlign: 'center',
          border: '1px solid rgba(255, 75, 75, 0.3)',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Something went wrong in this view
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            An unexpected error occurred while rendering this component. You can reload the view or return to the Dashboard.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={this.handleReset}
              style={{ padding: '8px 18px', fontSize: '13px' }}
            >
              🔄 Reload View
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{ padding: '8px 18px', fontSize: '13px' }}
            >
              🚀 Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

