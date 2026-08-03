import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Self-defense: Trendline ships no service worker. If one is registered on
// this origin, it belongs to another local app (e.g. a previously-run PWA on
// the same host) and would intercept our /api calls → "cannot reach server".
// Evict any such worker and its caches so Trendline always talks to the API.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
  if (window.caches?.keys) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
