import { useState, useEffect, useCallback } from "react";

// Chart drawings (horizontal levels + trendlines) persisted per ticker +
// timeframe in localStorage, so support/resistance you mark stays put.
export function useDrawings(ticker, timeframe) {
  const key = `trendline:draw:${ticker}:${timeframe}`;
  const [drawings, setDrawings] = useState([]);

  useEffect(() => {
    try { setDrawings(JSON.parse(localStorage.getItem(key) || "[]")); }
    catch { setDrawings([]); }
  }, [key]);

  const save = useCallback((next) => {
    setDrawings(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  }, [key]);

  const add = useCallback((d) => save([...drawings, d]), [drawings, save]);
  const clear = useCallback(() => save([]), [save]);
  const undo = useCallback(() => save(drawings.slice(0, -1)), [drawings, save]);

  return { drawings, add, clear, undo };
}
