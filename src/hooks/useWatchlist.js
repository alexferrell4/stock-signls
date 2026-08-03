import { useState, useCallback } from "react";

const KEY = "trendline:watchlist";

// Starred tickers, persisted in localStorage (per browser, no backend needed).
export function useWatchlist() {
  const [set, setSet] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); }
    catch { return new Set(); }
  });

  const toggle = useCallback((ticker) => {
    setSet((prev) => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      try { localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const has = useCallback((t) => set.has(t), [set]);
  return { toggle, has, count: set.size };
}
