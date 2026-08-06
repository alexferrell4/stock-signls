import { useState, useEffect, useCallback } from "react";
import { fetchStocks, triggerRefresh } from "../lib/api";

export function useStocks() {
  const [stocks, setStocks]           = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nextUpdate, setNextUpdate]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [refreshing, setRefreshing]   = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchStocks();
      setStocks(data.stocks ?? []);
      setLastUpdated(data.lastUpdated);
      setNextUpdate(data.nextUpdate);
      setError(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Self-scheduling poll: while connected, refresh every 5 min; while the
  // server is unreachable (e.g. the API started a moment after the UI under
  // `npm start`), retry every 3s so it recovers on its own instead of being
  // stuck on the error screen for a full interval.
  useEffect(() => {
    let stopped = false;
    let timer;
    const tick = async () => {
      if (stopped) return;
      const ok = await load();
      // Poll frequently so the UI reflects the server's price ticks; back off
      // to a fast retry while the API is unreachable.
      timer = setTimeout(tick, ok ? 10 * 1000 : 3000);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await triggerRefresh();
    // Poll every 3s until data updates
    let tries = 0;
    const poll = setInterval(async () => {
      await load();
      tries++;
      if (tries > 120) clearInterval(poll);
    }, 3000);
    setTimeout(() => {
      clearInterval(poll);
      setRefreshing(false);
    }, 10 * 60 * 1000);
  }, [load]);

  const summary = {
    buy:  stocks.filter(s => s.signal === "BUY").length,
    hold: stocks.filter(s => s.signal === "HOLD").length,
    sell: stocks.filter(s => s.signal === "SELL").length,
    avg:  stocks.length > 0
      ? Math.round(stocks.reduce((a, s) => a + (s.score ?? 0), 0) / stocks.length * 100)
      : 0,
  };

  return { stocks, loading, error, lastUpdated, nextUpdate, summary, refresh, refreshing };
}
