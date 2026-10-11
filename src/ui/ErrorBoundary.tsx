import { Component, type ReactNode } from 'react';

/** Shown when the 3D scene cannot start (model failed to download, WebGL error, …). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="overlay error">
        <div className="card">
          <h1>Загварыг ачаалж чадсангүй</h1>
          <p className="lead">Интернэт холболтоо шалгаад дахин оролдоно уу.</p>
          <div className="start-actions">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Дахин ачаалах
            </button>
          </div>
        </div>
      </div>
    );
  }
}
