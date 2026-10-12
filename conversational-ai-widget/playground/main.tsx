import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ChatbotWidget } from "../src/index";
import "../src/styles/widget.css";

function App() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2.5rem",
        fontFamily: "system-ui, sans-serif",
        color: "#101010",
      }}
    >
      <h1 style={{ margin: 0 }}>Conversational AI Widget — Playground</h1>
      <p style={{ maxWidth: 620, lineHeight: 1.5 }}>
        The launcher button is in the bottom-right corner. Chat requests are sent
        to <code>/mcp/agent</code>, which Vite proxies to the{" "}
        <code>mcp-uacapi</code> backend (default{" "}
        <code>http://localhost:8787</code>). Start that backend first with{" "}
        <code>npm run serve</code> in the <code>mcp-uacapi</code> repo.
      </p>

      <ChatbotWidget
        mcpServerUrl="/mcp"
        userName="Ankush Katharia"
        onNavigate={(url) => {
          console.log("[playground] onNavigate:", url);
          window.open(url, "_blank", "noopener,noreferrer");
        }}
        onAddToCart={(productId, sku) =>
          console.log("[playground] onAddToCart:", productId, sku)
        }
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
