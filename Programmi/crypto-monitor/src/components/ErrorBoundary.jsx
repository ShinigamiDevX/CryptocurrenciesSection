import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '2rem',
                    background: '#0f172a',
                    color: '#ef4444',
                    height: '100vh',
                    fontFamily: 'monospace',
                    overflow: 'auto'
                }}>
                    <h1>Qualcosa è andato storto.</h1>
                    <h2 style={{ color: 'white' }}>{this.state.error && this.state.error.toString()}</h2>
                    <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', color: '#94a3b8' }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '2rem',
                            padding: '0.5rem 1rem',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Ricarica Pagina
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
