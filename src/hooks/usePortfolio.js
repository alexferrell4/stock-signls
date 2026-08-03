import { useState, useEffect, useCallback } from "react";
import { fetchPortfolio, addHolding, removeHolding } from "../lib/api";

// Loads the portfolio and exposes add/remove mutations. Mutations return the
// freshly-recomputed portfolio, so we just set it directly.
export function usePortfolio(enabled) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchPortfolio());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const add = useCallback(async (ticker, shares, costBasis) => {
    const next = await addHolding(ticker, shares, costBasis);
    setData(next);
    return next;
  }, []);

  const remove = useCallback(async (ticker) => {
    setData(await removeHolding(ticker));
  }, []);

  return { data, loading, error, reload: load, add, remove };
}
