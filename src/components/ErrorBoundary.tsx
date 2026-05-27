import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "sans-serif",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#111" }}>
          Алдаа гарлаа
        </h2>
        <p style={{ color: "#555", maxWidth: "480px" }}>
          {this.state.error?.message ?? "Тодорхойгүй алдаа гарлаа. Хуудсыг дахин ачааллана уу."}
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            padding: "0.6rem 1.5rem",
            borderRadius: "0.75rem",
            background: "#1a6b3a",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Дахин оролдох
        </button>
      </div>
    );
  }
}
