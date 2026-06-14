import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./store/useThemeStore";
import { initCustomTokens } from "./theme/customTokens";

initTheme();
initCustomTokens();

console.log("[SOVERN] main.tsx: Initializing React...");

const rootElement = document.getElementById("root");

if (rootElement) {
  console.log("[SOVERN] main.tsx: Root element found. Mounting App...");
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  console.error("[SOVERN] main.tsx: FATAL - Could not find element with id 'root'");
  // Fallback for extreme cases
  document.body.innerHTML = '<div style="color:white; background:red; padding:20px;">FATAL: Root element missing in HTML</div>';
}
