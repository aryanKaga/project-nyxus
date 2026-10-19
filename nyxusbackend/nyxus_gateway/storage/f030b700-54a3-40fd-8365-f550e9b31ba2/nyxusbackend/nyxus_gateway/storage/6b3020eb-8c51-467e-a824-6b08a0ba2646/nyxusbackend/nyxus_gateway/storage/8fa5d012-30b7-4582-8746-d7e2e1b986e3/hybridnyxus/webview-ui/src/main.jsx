import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import './index.css'

class AppErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[Nyxus Replica UI] Render failed:', error?.name || 'Error');
  }

  render() {
    if (this.state.failed) {
      return (
        <main style={{ padding: 16, fontFamily: 'sans-serif' }}>
          <h2>Nyxus chat could not render</h2>
          <p>A rendering error occurred. Reload the chat UI to try again.</p>
          <button onClick={() => window.location.reload()}>Reload chat UI</button>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);