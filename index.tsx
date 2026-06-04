import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import { I18nProvider } from "./hooks/useI18n";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>,
);

// Remove fallback element if present after mounting
const fallback = document.getElementById("root-fallback");
if (fallback && fallback.parentNode) {
  try {
    fallback.parentNode.removeChild(fallback);
  } catch (e) {
    // ignore
  }
}
