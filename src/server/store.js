// ─── In-memory Store + Refresh Pipeline ─────────────────────────
// Holds the latest computed signals, news, and a short intraday score
// history per ticker (feeds the modal chart). Durable snapshots + the
// historical track record are persisted via the injected `db` (SQLite).

import { computeSignal, scoreText } from "./signal.js";
import { companyName } from "./universe.js";
import { detectAlerts } from "./alerts.js";

const HISTORY_LEN = 60; // keep last N score points per ticker

// No-op fallbacks so the store works with or without a DB / alert channel
// (e.g. Phase 0/1 tests that don't care about persistence or alerting).
const NO_DB = {
  recordSnapshot() {}, evaluatePending() { return 0; },
  listHoldings() { return []; }, recordAlert() { return 0; },
};
const NO_CHANNEL = { deliver() {} };

export function createStore({ provider, ai, db = NO_DB, channel = NO_CHANNEL }) {
  const store = {
    stocks: {},        // ticker -> enriched signal object
    news: {},          // ticker -> [news items]
    history: {},       // ticker -> [{ time, score, signal }]
    lastUpdated: null,
    nextUpdate: null,
    refreshing: false,
    lastError: null,
  };

  function pushHistory(ticker, score, signal) {
    const arr = store.history[ticker] ?? (store.history[ticker] = []);
    arr.push({
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      t: Date.now(),
      score,
      signal,
    });
    if (arr.length > HISTORY_LEN) arr.shift();
  }

  async function refreshOne(ticker) {
    const quote = await provider.quote(ticker);
    const news = await provider.news(ticker);

    const sig = computeSignal({
      changePercent: quote.changePercent,
      currentVolume: quote.currentVolume,
      avgVolume: quote.avgVolume,
      sentimentScore: quote.sentimentScore,
      newsItems: news,
      // Let the provider declare which inputs are real (Finnhub's free tier
      // has no volume/sentiment); the engine renormalizes over what's present.
      available: {
        volume: quote.avgVolume > 0,
        sentiment: quote.sentimentAvailable !== false,
      },
    });

    const analysis = await ai.generateAnalysis({
      ticker,
      company: companyName(ticker),
      quote,
      signal: sig,
      news,
    });

    const stock = {
      ticker,
      company: companyName(ticker),
      price: quote.price,
      changePercent: quote.changePercent,
      high: quote.high,
      low: quote.low,
      open: quote.open,
      volume: quote.currentVolume,
      avgVolume: quote.avgVolume,
      finnhubSentiment: quote.sentimentScore,
      ...sig,
      aiAnalysis: analysis,
      updatedAt: new Date().toISOString(),
    };

    store.stocks[ticker] = stock;
    store.news[ticker] = news;
    pushHistory(ticker, sig.score, sig.signal);
    return stock;
  }

  // Refresh the whole universe. Spaced out to respect rate limits in live
  // mode; in mock mode the sleep is harmless and keeps timing realistic.
  async function refreshAll({ spacingMs = 0 } = {}) {
    if (store.refreshing) return;
    store.refreshing = true;
    store.lastError = null;
    try {
      // Snapshot signals before this cycle overwrites them, so we can detect
      // transitions (e.g. a held position flipping BUY → SELL) afterward.
      const prevSignals = Object.fromEntries(
        Object.values(store.stocks).map((s) => [s.ticker, s.signal])
      );

      const prices = {};
      for (const ticker of provider.tickers) {
        try {
          const s = await refreshOne(ticker);
          prices[ticker] = s.price;
        } catch (e) {
          store.lastError = `${ticker}: ${e.message}`;
        }
        if (spacingMs) await new Promise((r) => setTimeout(r, spacingMs));
      }

      // Track record: grade prior signals against these fresh prices FIRST,
      // then record this cycle's signals (so they're graded next time).
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      store.lastEvaluated = db.evaluatePending(prices, nowMs);
      for (const ticker of Object.keys(prices)) {
        const s = store.stocks[ticker];
        db.recordSnapshot({
          ticker, ts: nowIso, tsMs: nowMs,
          price: s.price, score: s.score, signal: s.signal, changePercent: s.changePercent,
        });
      }

      // Alerting: fire on any signal transition, prioritizing held positions.
      const heldSet = new Set(db.listHoldings().map((h) => h.ticker));
      const alerts = detectAlerts(prevSignals, store.stocks, heldSet, nowMs);
      for (const a of alerts) {
        db.recordAlert(a);
        try { await channel.deliver(a); } catch { /* delivery is best-effort */ }
      }
      store.lastAlerts = alerts.length;

      provider.tick?.();
      store.lastUpdated = nowIso;
    } finally {
      store.refreshing = false;
    }
  }

  return { store, refreshAll, refreshOne, scoreText };
}
